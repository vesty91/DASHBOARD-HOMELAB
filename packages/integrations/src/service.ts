import { performance } from "node:perf_hooks";
import {
  decryptSecret,
  encryptSecret,
  redact,
  SecretError,
  type SecretKeyring,
} from "@dashboard/secrets";
import { hasPermission } from "@dashboard/permissions";
import { assertConfigExcludesSecretKeys } from "./definition";
import { IntegrationError, type IntegrationErrorCode } from "./errors";
import { DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, secureRequest } from "./http-client";
import type { IntegrationRegistry } from "./registry";
import {
  integrationCreateSchema,
  integrationSetSecretSchema,
  integrationUpdateSchema,
} from "./schemas";
import type {
  IntegrationActor,
  IntegrationCache,
  IntegrationCreateInput,
  IntegrationDefinition,
  IntegrationDto,
  IntegrationRateLimiter,
  IntegrationRecord,
  IntegrationStore,
  JsonObject,
} from "./types";

export interface IntegrationServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  rateLimiter: IntegrationRateLimiter;
  keyring?: SecretKeyring;
  request?: typeof secureRequest;
}

function requireAccess(
  actor: IntegrationActor,
  permission: "integration.read" | "integration.create" | "integration.manage",
): void {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active")
    throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  if (!hasPermission(actor.subject, permission))
    throw new IntegrationError("FORBIDDEN", "Permission denied");
}

function timeoutFromConfig(config: JsonObject): number {
  const raw = config.timeoutMs;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
}

function verifyTlsFromConfig(config: JsonObject): boolean {
  return config.verifyTls !== false;
}

export function collectSecretStringValues(secrets: unknown): string[] {
  const values: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.length > 0) values.push(value);
    else if (Array.isArray(value)) for (const entry of value) visit(entry);
    else if (value && typeof value === "object")
      for (const entry of Object.values(value as JsonObject)) visit(entry);
  };
  visit(secrets);
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

export function redactKnownSecretValues(value: unknown, secretValues: readonly string[]): unknown {
  if (secretValues.length === 0) return value;
  if (typeof value === "string") {
    let output = value;
    for (const secret of secretValues)
      if (output.includes(secret)) output = output.split(secret).join("[REDACTED]");
    return output;
  }
  if (Array.isArray(value))
    return value.map((entry) => redactKnownSecretValues(entry, secretValues));
  if (value && typeof value === "object") {
    const output: JsonObject = {};
    for (const [key, entry] of Object.entries(value as JsonObject))
      output[key] = redactKnownSecretValues(entry, secretValues);
    return output;
  }
  return value;
}

function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return undefined;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value.slice(0, 200);
  if (Array.isArray(value))
    return value.slice(0, 20).map((entry) => sanitizeMetadata(entry, depth + 1));
  if (value && typeof value === "object") {
    const output: JsonObject = {};
    for (const [key, entry] of Object.entries(value as JsonObject).slice(0, 20)) {
      const sanitized = sanitizeMetadata(entry, depth + 1);
      if (sanitized !== undefined) output[key] = sanitized;
    }
    return output;
  }
  return undefined;
}

async function toDto(
  store: IntegrationStore,
  registry: IntegrationRegistry,
  record: IntegrationRecord,
): Promise<IntegrationDto> {
  const definition = registry.get(record.type);
  const states = await store.listSecretStates(record.id);
  const secrets: Record<string, { configured: boolean }> = {};
  if (definition)
    for (const field of definition.secretFields)
      secrets[field.key] = { configured: states.some((state) => state.key === field.key) };
  else for (const state of states) secrets[state.key] = { configured: true };
  return {
    id: record.id,
    type: record.type,
    name: record.name,
    baseUrl: record.baseUrl,
    enabled: record.enabled,
    config: record.config,
    status: record.status,
    lastCheckedAt: record.lastCheckedAt,
    configRevision: record.configRevision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    definitionAvailable: Boolean(definition),
    capabilities: definition ? [...definition.capabilities] : [],
    secrets,
  };
}

function requireKeyring(keyring: SecretKeyring | undefined): SecretKeyring {
  if (!keyring)
    throw new IntegrationError("SECRETS_NOT_CONFIGURED", "SECRET_ENCRYPTION_KEY is not configured");
  return keyring;
}

export function createIntegrationService(deps: IntegrationServiceDeps) {
  const request = deps.request ?? secureRequest;
  const { store, registry, cache, rateLimiter, keyring } = deps;

  return {
    catalog(actor: IntegrationActor) {
      requireAccess(actor, "integration.read");
      return registry.catalog();
    },
    async list(actor: IntegrationActor, input: { limit: number; cursor?: string | undefined }) {
      requireAccess(actor, "integration.read");
      const rows = await store.list(input.limit + 1, input.cursor);
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      return {
        items: await Promise.all(page.map((row) => toDto(store, registry, row))),
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
      };
    },
    async get(id: string, actor: IntegrationActor) {
      requireAccess(actor, "integration.read");
      const record = await store.findById(id);
      if (!record) throw new IntegrationError("NOT_FOUND", "Integration not found");
      return toDto(store, registry, record);
    },
    async create(input: IntegrationCreateInput, actor: IntegrationActor) {
      requireAccess(actor, "integration.create");
      const parsed = integrationCreateSchema.parse(input);
      const definition = registry.get(parsed.type);
      if (!definition) throw new IntegrationError("MISCONFIGURED", "Unknown integration type");
      const config = definition.configSchema.parse(parsed.config) as JsonObject;
      assertConfigExcludesSecretKeys(definition, config);
      const created = await store.create({
        type: parsed.type,
        name: parsed.name,
        baseUrl: parsed.baseUrl,
        enabled: parsed.enabled,
        config,
        createdBy: actor.userId,
      });
      return toDto(store, registry, created);
    },
    async update(input: ReturnType<typeof integrationUpdateSchema.parse>, actor: IntegrationActor) {
      requireAccess(actor, "integration.manage");
      const parsed = integrationUpdateSchema.parse(input);
      const current = await store.findById(parsed.id);
      if (!current) throw new IntegrationError("NOT_FOUND", "Integration not found");
      const definition = registry.get(current.type);
      if (!definition && (parsed.config !== undefined || parsed.baseUrl !== undefined))
        throw new IntegrationError("MISCONFIGURED", "Unknown integration type");
      let nextConfig = current.config;
      if (parsed.config !== undefined) {
        if (!definition) throw new IntegrationError("MISCONFIGURED", "Unknown integration type");
        nextConfig = definition.configSchema.parse(parsed.config) as JsonObject;
        assertConfigExcludesSecretKeys(definition, nextConfig);
      }
      const bumpRevision =
        (parsed.baseUrl !== undefined && parsed.baseUrl !== current.baseUrl) ||
        (parsed.enabled !== undefined && parsed.enabled !== current.enabled) ||
        (parsed.config !== undefined &&
          JSON.stringify(parsed.config) !== JSON.stringify(current.config));
      const updated = await store.update({
        id: parsed.id,
        ...(parsed.name === undefined ? {} : { name: parsed.name }),
        ...(parsed.baseUrl === undefined ? {} : { baseUrl: parsed.baseUrl }),
        ...(parsed.enabled === undefined ? {} : { enabled: parsed.enabled }),
        ...(parsed.config === undefined ? {} : { config: nextConfig }),
        bumpRevision,
        resetStatus: bumpRevision,
      });
      if (!updated) throw new IntegrationError("NOT_FOUND", "Integration not found");
      if (bumpRevision) cache.invalidate(updated.id);
      return toDto(store, registry, updated);
    },
    async setSecret(
      input: { integrationId: string; key: string; value: string },
      actor: IntegrationActor,
    ) {
      requireAccess(actor, "integration.manage");
      const parsed = integrationSetSecretSchema.parse(input);
      const activeKeyring = requireKeyring(keyring);
      const current = await store.findById(parsed.integrationId);
      if (!current) throw new IntegrationError("NOT_FOUND", "Integration not found");
      const definition = registry.get(current.type);
      if (!definition) throw new IntegrationError("MISCONFIGURED", "Unknown integration type");
      const field = definition.secretFields.find((entry) => entry.key === parsed.key);
      if (!field) throw new IntegrationError("VALIDATION_ERROR", "Unknown secret field");
      const value = field.valueSchema.parse(parsed.value);
      const encrypted = encryptSecret(activeKeyring, {
        integrationId: current.id,
        key: parsed.key,
        plaintext: value,
      });
      await store.upsertSecret(current.id, { key: parsed.key, ...encrypted });
      cache.invalidate(current.id);
      return { configured: true as const };
    },
    async delete(id: string, actor: IntegrationActor) {
      requireAccess(actor, "integration.manage");
      if (!(await store.delete(id)))
        throw new IntegrationError("NOT_FOUND", "Integration not found");
      cache.invalidate(id);
      return { deleted: true as const };
    },
    async test(id: string, actor: IntegrationActor) {
      requireAccess(actor, "integration.manage");
      const current = await store.findById(id);
      if (!current) throw new IntegrationError("NOT_FOUND", "Integration not found");
      const definition = registry.get(current.type);
      if (!definition)
        return {
          ok: false as const,
          code: "MISCONFIGURED" as const,
          message: "Unknown integration type",
        };
      const parsedConfig = definition.configSchema.safeParse(current.config);
      if (!parsedConfig.success)
        return {
          ok: false as const,
          code: "MISCONFIGURED" as const,
          message: "Invalid configuration",
        };
      const config = parsedConfig.data as JsonObject;
      let secrets: JsonObject = {};
      try {
        secrets = await loadSecrets(store, definition, current.id, keyring);
      } catch (error) {
        if (error instanceof IntegrationError && error.code === "SECRETS_NOT_CONFIGURED")
          return {
            ok: false as const,
            code: "SECRETS_NOT_CONFIGURED" as const,
            message: "SECRET_ENCRYPTION_KEY is not configured",
          };
        if (error instanceof IntegrationError && error.code === "MISCONFIGURED")
          return { ok: false as const, code: "MISCONFIGURED" as const, message: error.message };
        throw error;
      }
      if (!rateLimiter.tryConsume(actor.userId ?? "anonymous", current.id))
        return { ok: false as const, code: "RATE_LIMITED" as const, message: "Too many tests" };
      const revision = current.configRevision;
      const secretValues = collectSecretStringValues(secrets);
      const started = performance.now();
      let result;
      try {
        result = await definition.testConnection({
          integrationId: current.id,
          baseUrl: current.baseUrl,
          config: parsedConfig.data,
          secrets,
          verifyTls: verifyTlsFromConfig(config),
          timeoutMs: timeoutFromConfig(config),
          request: (options) =>
            request({
              ...options,
              verifyTls: options.verifyTls ?? verifyTlsFromConfig(config),
              timeoutMs: options.timeoutMs ?? timeoutFromConfig(config),
              allowedSchemes: options.allowedSchemes ?? definition.allowedSchemes,
              maxRetries: 0,
              maxRedirects: 0,
            }),
        });
      } catch (error) {
        result = {
          ok: false as const,
          code: classifyThrown(error),
          message: "Connection test failed",
        };
      }
      const latencyMs = Math.max(
        0,
        Math.round(result.ok ? result.latencyMs : performance.now() - started),
      );
      const normalized = result.ok
        ? {
            ok: true as const,
            latencyMs,
            ...(result.metadata
              ? {
                  metadata: redact(
                    sanitizeMetadata(redactKnownSecretValues(result.metadata, secretValues)),
                  ) as JsonObject,
                }
              : {}),
          }
        : {
            ok: false as const,
            code: result.code,
            ...(result.message
              ? {
                  message: String(redactKnownSecretValues(result.message, secretValues)),
                }
              : {}),
          };
      if (normalized.ok || shouldPersistFailure(normalized.code)) {
        const persisted = await store.persistConnectionResult(
          current.id,
          revision,
          normalized.ok ? "available" : "unavailable",
        );
        if (!persisted)
          return {
            ok: false as const,
            code: "STALE_RESULT" as const,
            message: "Configuration changed during test",
          };
      }
      return normalized;
    },
  };
}

function shouldPersistFailure(code: IntegrationErrorCode): boolean {
  switch (code) {
    case "UNAUTHORIZED":
    case "FORBIDDEN":
    case "TIMEOUT":
    case "DNS_ERROR":
    case "TLS_ERROR":
    case "UNREACHABLE":
    case "INVALID_RESPONSE":
    case "RATE_LIMITED":
    case "UNSUPPORTED_VERSION":
    case "NOT_FOUND":
    case "UNKNOWN":
    case "TARGET_BLOCKED":
      return true;
    case "MISCONFIGURED":
    case "SECRETS_NOT_CONFIGURED":
    case "STALE_RESULT":
    case "VALIDATION_ERROR":
    case "CONFLICT":
    case "INTERNAL_ERROR":
      return false;
    default: {
      const _exhaustive: never = code;
      return _exhaustive;
    }
  }
}

function classifyThrown(error: unknown): IntegrationErrorCode {
  if (error instanceof IntegrationError) return error.code;
  return "UNKNOWN";
}

async function loadSecrets(
  store: IntegrationStore,
  definition: IntegrationDefinition,
  integrationId: string,
  keyring: SecretKeyring | undefined,
): Promise<JsonObject> {
  const required = definition.secretFields.filter((field) => field.required);
  const rows = await store.loadEncryptedSecrets(integrationId);
  if (required.length > 0 && !keyring && rows.length > 0)
    throw new IntegrationError("SECRETS_NOT_CONFIGURED", "SECRET_ENCRYPTION_KEY is not configured");
  if (required.some((field) => !rows.some((row) => row.key === field.key)))
    throw new IntegrationError("MISCONFIGURED", "Required secrets are not configured");
  if (rows.length === 0) {
    const parsed = definition.secretSchema.safeParse({});
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Required secrets are not configured");
    return parsed.data as JsonObject;
  }
  const active = requireKeyring(keyring);
  const secrets: JsonObject = {};
  for (const row of rows) {
    try {
      secrets[row.key] = decryptSecret(active, {
        integrationId,
        key: row.key,
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.authTag,
        keyVersion: row.keyVersion,
      });
    } catch (error) {
      if (error instanceof SecretError)
        throw new IntegrationError("MISCONFIGURED", "Unable to decrypt secrets");
      throw error;
    }
  }
  const parsed = definition.secretSchema.safeParse(secrets);
  if (!parsed.success)
    throw new IntegrationError("MISCONFIGURED", "Required secrets are not configured");
  return parsed.data as JsonObject;
}

export type IntegrationService = ReturnType<typeof createIntegrationService>;
