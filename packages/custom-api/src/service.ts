import {
  DEFAULT_TIMEOUT_MS,
  INTEGRATION_ERROR_CODES,
  IntegrationError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  collectSecretStringValues,
  loadIntegrationSecrets,
  redactKnownSecretValues,
  requireCapability,
  type IntegrationCache,
  type IntegrationDefinition,
  type IntegrationErrorCode,
  type IntegrationRateLimiter,
  type IntegrationRecord,
  type IntegrationRegistry,
  type IntegrationStore,
  type JsonObject,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { assertCustomApiAccess, customApiPermissionsView } from "./access";
import {
  customApiOverviewCacheOperation,
  customApiValueCacheOperation,
  customApiValueFingerprint,
  overviewFailureCacheOperation,
} from "./cache-key";
import {
  CUSTOM_API_OVERVIEW_FAILURE_TTL_MS,
  customApiContextFromIntegration,
  fetchCustomApiOverview,
  fetchCustomApiValue,
  overviewCacheTtl,
  type CustomApiClientContext,
} from "./client";
import { CUSTOM_API_INTEGRATION_ID } from "./definition";
import { CustomApiError, toIntegrationError } from "./errors";
import type { CustomApiOverviewCoalescer } from "./overview-coalescer";
import type { CustomApiRefreshFence } from "./refresh-fence";
import {
  customApiValueInputSchema,
  type CustomApiConfig,
  type CustomApiSecrets,
  type CustomApiValueInput,
} from "./schemas";
import type {
  CustomApiActor,
  CustomApiIntegrationMetadata,
  CustomApiOverview,
  CustomApiPermissionsView,
  CustomApiValueResult,
} from "./types";

export interface CustomApiServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: CustomApiRefreshFence;
  overviewCoalescer: CustomApiOverviewCoalescer;
  keyring?: Parameters<typeof loadIntegrationSecrets>[3];
}

function timeoutFromConfig(config: JsonObject): number {
  const raw = config.timeoutMs;
  if (typeof raw !== "number" || !Number.isInteger(raw)) return DEFAULT_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, raw));
}

function verifyTlsFromConfig(config: JsonObject): boolean {
  return config.verifyTls !== false;
}

function trustedCaFromConfig(config: JsonObject): string | undefined {
  return typeof config.trustedCaPem === "string" ? config.trustedCaPem : undefined;
}

type CachedFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof CustomApiError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): CustomApiOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value) || !("probe" in value))
    return undefined;
  return value as CustomApiOverview;
}

function asCachedValue(value: unknown): CustomApiValueResult | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value) || !("endpointKey" in value))
    return undefined;
  return value as CustomApiValueResult;
}

function asCachedFailure(value: unknown): CachedFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

function metadataFrom(
  record: IntegrationRecord,
  config: CustomApiConfig,
): CustomApiIntegrationMetadata {
  return Object.freeze({
    id: record.id,
    name: record.name,
    enabled: record.enabled,
    endpoints: Object.freeze(
      config.endpoints.map((endpoint) =>
        Object.freeze({ key: endpoint.key, label: endpoint.label, path: endpoint.path }),
      ),
    ),
  });
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listCustomApiRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === CUSTOM_API_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createCustomApiService(deps: CustomApiServiceDeps) {
  function definition(): IntegrationDefinition<CustomApiConfig, CustomApiSecrets> {
    const registered = deps.registry.get(CUSTOM_API_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Custom API definition is not registered");
    return registered as IntegrationDefinition<CustomApiConfig, CustomApiSecrets>;
  }

  async function requireRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== CUSTOM_API_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition API personnalisée introuvable");
    return record;
  }

  async function parsedConfig(record: IntegrationRecord): Promise<CustomApiConfig> {
    const parsed = definition().configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Custom API configuration");
    return parsed.data;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: CustomApiClientContext;
    record: IntegrationRecord;
    config: CustomApiConfig;
    secrets: CustomApiSecrets;
    cacheSecrets: Awaited<ReturnType<IntegrationStore["loadEncryptedSecrets"]>>;
  }> {
    const record = await requireRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Custom API integration is disabled");
    const customDefinition = definition();
    const config = await parsedConfig(record);
    requireCapability(customDefinition.capabilities, capability);
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      customDefinition,
      record.id,
      deps.keyring,
    )) as CustomApiSecrets;
    if (secrets.apiKey && !config.apiKeyHeader)
      throw new IntegrationError(
        "MISCONFIGURED",
        "Custom API key is configured without apiKeyHeader",
      );
    const cacheSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    void refreshGeneration;
    return {
      record,
      config,
      secrets,
      cacheSecrets,
      ctx: customApiContextFromIntegration({
        integrationId: record.id,
        baseUrl: record.baseUrl,
        config,
        secrets,
        verifyTls: verifyTlsFromConfig(config as JsonObject),
        timeoutMs: timeoutFromConfig(config as JsonObject),
        secretValues,
        request: (options) =>
          deps.request({
            ...options,
            verifyTls: options.verifyTls ?? verifyTlsFromConfig(config as JsonObject),
            timeoutMs: options.timeoutMs ?? timeoutFromConfig(config as JsonObject),
            allowedSchemes: options.allowedSchemes ?? customDefinition.allowedSchemes,
            maxRetries: 0,
            maxRedirects: 0,
            ...(trustedCaPem === undefined || options.trustedCaPem !== undefined
              ? {}
              : { trustedCaPem }),
          }),
      }),
    };
  }

  async function overviewFor(
    integrationId: string,
    refreshGeneration: number,
  ): Promise<CustomApiOverview> {
    const loaded = await loadContext(integrationId, "status.read", refreshGeneration);
    const cacheOperation = customApiOverviewCacheOperation(
      loaded.record.configRevision,
      loaded.cacheSecrets,
      refreshGeneration,
    );
    const cached = asCachedOverview(deps.cache.get(loaded.record.id, cacheOperation));
    if (cached) return cached;
    const cachedFailure = asCachedFailure(
      deps.cache.get(loaded.record.id, overviewFailureCacheOperation(cacheOperation)),
    );
    if (cachedFailure) throwCachedFailure(cachedFailure);
    return deps.overviewCoalescer.run(`${loaded.record.id}:${cacheOperation}`, async () => {
      const rechecked = asCachedOverview(deps.cache.get(loaded.record.id, cacheOperation));
      if (rechecked) return rechecked;
      const recheckedFailure = asCachedFailure(
        deps.cache.get(loaded.record.id, overviewFailureCacheOperation(cacheOperation)),
      );
      if (recheckedFailure) throwCachedFailure(recheckedFailure);
      try {
        const overview = await fetchCustomApiOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          probe: Object.freeze(overview.probe),
          endpoints: Object.freeze([...overview.endpoints]),
        });
        if (deps.refreshFence.current(integrationId) === refreshGeneration)
          deps.cache.set(loaded.record.id, cacheOperation, frozen, overviewCacheTtl(frozen.status));
        return frozen;
      } catch (error) {
        const safe = normalizedRedactedError(error, loaded.secrets);
        if (deps.refreshFence.current(integrationId) === refreshGeneration)
          deps.cache.set(
            loaded.record.id,
            overviewFailureCacheOperation(cacheOperation),
            { code: safe.code, message: safe.message },
            CUSTOM_API_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  async function valueFor(
    input: CustomApiValueInput,
    refreshGeneration: number,
  ): Promise<CustomApiValueResult> {
    const loaded = await loadContext(input.integrationId, "status.read", refreshGeneration);
    const cacheOperation = customApiValueCacheOperation(
      loaded.record.configRevision,
      loaded.cacheSecrets,
      customApiValueFingerprint(input.endpointKey, input.jsonPath, input.display),
      refreshGeneration,
    );
    const cached = asCachedValue(deps.cache.get(loaded.record.id, cacheOperation));
    if (cached) return cached;
    const cachedFailure = asCachedFailure(
      deps.cache.get(loaded.record.id, overviewFailureCacheOperation(cacheOperation)),
    );
    if (cachedFailure) throwCachedFailure(cachedFailure);
    return deps.overviewCoalescer.run(`${loaded.record.id}:${cacheOperation}`, async () => {
      const rechecked = asCachedValue(deps.cache.get(loaded.record.id, cacheOperation));
      if (rechecked) return rechecked;
      const recheckedFailure = asCachedFailure(
        deps.cache.get(loaded.record.id, overviewFailureCacheOperation(cacheOperation)),
      );
      if (recheckedFailure) throwCachedFailure(recheckedFailure);
      try {
        const result = await fetchCustomApiValue(
          loaded.ctx,
          input.endpointKey,
          input.jsonPath,
          input.display,
        );
        const frozen = Object.freeze({
          status: result.status,
          fetchedAt: result.fetchedAt,
          endpointKey: result.endpointKey,
          value: Object.freeze(result.value),
        });
        if (deps.refreshFence.current(input.integrationId) === refreshGeneration)
          deps.cache.set(loaded.record.id, cacheOperation, frozen, overviewCacheTtl(frozen.status));
        return frozen;
      } catch (error) {
        const safe = normalizedRedactedError(error, loaded.secrets);
        if (deps.refreshFence.current(input.integrationId) === refreshGeneration)
          deps.cache.set(
            loaded.record.id,
            overviewFailureCacheOperation(cacheOperation),
            { code: safe.code, message: safe.message },
            CUSTOM_API_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: CustomApiActor): CustomApiPermissionsView {
      return customApiPermissionsView(actor);
    },
    async listIntegrations(
      actor: CustomApiActor,
    ): Promise<readonly CustomApiIntegrationMetadata[]> {
      assertCustomApiAccess(actor, "read");
      const records = await listCustomApiRecords(deps.store);
      const listed: CustomApiIntegrationMetadata[] = [];
      for (const record of records) {
        const parsed = definition().configSchema.safeParse(record.config);
        if (!parsed.success) continue;
        listed.push(metadataFrom(record, parsed.data));
      }
      return listed;
    },
    async getIntegrationMetadata(
      integrationId: string,
      actor: CustomApiActor,
    ): Promise<CustomApiIntegrationMetadata> {
      assertCustomApiAccess(actor, "read");
      const record = await requireRecord(integrationId);
      return metadataFrom(record, await parsedConfig(record));
    },
    async getOverview(integrationId: string, actor: CustomApiActor): Promise<CustomApiOverview> {
      assertCustomApiAccess(actor, "read");
      const record = await requireRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(
      integrationId: string,
      actor: CustomApiActor,
    ): Promise<CustomApiOverview> {
      assertCustomApiAccess(actor, "read");
      const record = await requireRecord(integrationId);
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Custom API refreshes");
      const generation = deps.refreshFence.advance(record.id);
      deps.cache.invalidate(record.id);
      return overviewFor(record.id, generation);
    },
    async getValue(
      input: CustomApiValueInput,
      actor: CustomApiActor,
    ): Promise<CustomApiValueResult> {
      assertCustomApiAccess(actor, "read");
      const parsed = customApiValueInputSchema.parse(input);
      const record = await requireRecord(parsed.integrationId);
      return valueFor(parsed, deps.refreshFence.current(record.id));
    },
    async refreshValue(
      input: CustomApiValueInput,
      actor: CustomApiActor,
    ): Promise<CustomApiValueResult> {
      assertCustomApiAccess(actor, "read");
      const parsed = customApiValueInputSchema.parse(input);
      const record = await requireRecord(parsed.integrationId);
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Custom API refreshes");
      const generation = deps.refreshFence.advance(record.id);
      deps.cache.invalidate(record.id);
      return valueFor(parsed, generation);
    },
  };
}

export type CustomApiService = ReturnType<typeof createCustomApiService>;
