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
  runSafeIntegrationAction,
  type IntegrationCache,
  type IntegrationDefinition,
  type IntegrationErrorCode,
  type IntegrationRateLimiter,
  type IntegrationRecord,
  type IntegrationRegistry,
  type IntegrationStore,
  type JsonObject,
  type SafeActionInFlightGuard,
  type SafeActionRateLimiter,
  type SafeActionResult,
  type SecureHttpRequest,
  type SecureHttpResult,
} from "@dashboard/integrations";
import { assertNtfyAccess, ntfyPermissionsView } from "./access";
import { ntfyOverviewCacheOperation, overviewFailureCacheOperation } from "./cache-key";
import {
  NTFY_OVERVIEW_FAILURE_TTL_MS,
  fetchNtfyOverview,
  ntfyContextFromIntegration,
  overviewCacheTtl,
  postNtfyPublish,
  type NtfyClientContext,
} from "./client";
import { NTFY_INTEGRATION_ID } from "./definition";
import { NtfyError, toIntegrationError } from "./errors";
import {
  assertNtfyMessage,
  assertNtfyPriority,
  assertNtfyTags,
  assertNtfyTitle,
  assertNtfyTopic,
} from "./topic";
import type { NtfyOverviewCoalescer } from "./overview-coalescer";
import type { NtfyRefreshFence } from "./refresh-fence";
import type { NtfyConfig, NtfyPublishInput, NtfySecrets } from "./schemas";
import type {
  NtfyActor,
  NtfyIntegrationMetadata,
  NtfyOverview,
  NtfyPermissionsView,
} from "./types";

export interface NtfyServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: NtfyRefreshFence;
  overviewCoalescer: NtfyOverviewCoalescer;
  actionRateLimiter: SafeActionRateLimiter;
  inFlight: SafeActionInFlightGuard;
  publish?: (integrationId: string) => Promise<void>;
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

type CachedNtfyOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof NtfyError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): NtfyOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as NtfyOverview;
}

function asCachedOverviewFailure(value: unknown): CachedNtfyOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedNtfyOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listNtfyRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === NTFY_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createNtfyService(deps: NtfyServiceDeps) {
  function definition(): IntegrationDefinition<NtfyConfig, NtfySecrets> {
    const registered = deps.registry.get(NTFY_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "ntfy definition is not registered");
    return registered as IntegrationDefinition<NtfyConfig, NtfySecrets>;
  }

  async function requireNtfyRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== NTFY_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition ntfy introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: NtfyClientContext;
    recordId: string;
    secrets: NtfySecrets;
    cacheOperation: string;
  }> {
    const record = await requireNtfyRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "ntfy integration is disabled");
    const ntfyDefinition = definition();
    const parsed = ntfyDefinition.configSchema.safeParse(record.config);
    if (!parsed.success) throw new IntegrationError("MISCONFIGURED", "Invalid ntfy configuration");
    requireCapability(ntfyDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      ntfyDefinition,
      record.id,
      deps.keyring,
    )) as NtfySecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: ntfyOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: ntfyContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? ntfyDefinition.allowedSchemes,
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
  ): Promise<NtfyOverview> {
    const loaded = await loadContext(integrationId, "status.read", refreshGeneration);
    const cached = asCachedOverview(deps.cache.get(loaded.recordId, loaded.cacheOperation));
    if (cached) return cached;
    const cachedFailure = asCachedOverviewFailure(
      deps.cache.get(loaded.recordId, overviewFailureCacheOperation(loaded.cacheOperation)),
    );
    if (cachedFailure) throwCachedFailure(cachedFailure);
    return deps.overviewCoalescer.run(`${loaded.recordId}:${loaded.cacheOperation}`, async () => {
      const rechecked = asCachedOverview(deps.cache.get(loaded.recordId, loaded.cacheOperation));
      if (rechecked) return rechecked;
      const recheckedFailure = asCachedOverviewFailure(
        deps.cache.get(loaded.recordId, overviewFailureCacheOperation(loaded.cacheOperation)),
      );
      if (recheckedFailure) throwCachedFailure(recheckedFailure);
      try {
        const overview = await fetchNtfyOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          health: Object.freeze(overview.health),
          stats: Object.freeze(overview.stats),
          version: Object.freeze(overview.version),
        });
        if (deps.refreshFence.current(integrationId) === refreshGeneration)
          deps.cache.set(loaded.recordId, loaded.cacheOperation, frozen, overviewCacheTtl(frozen));
        return frozen;
      } catch (error) {
        const safe = normalizedRedactedError(error, loaded.secrets);
        if (deps.refreshFence.current(integrationId) === refreshGeneration)
          deps.cache.set(
            loaded.recordId,
            overviewFailureCacheOperation(loaded.cacheOperation),
            { code: safe.code, message: safe.message },
            NTFY_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: NtfyActor): NtfyPermissionsView {
      return ntfyPermissionsView(actor);
    },
    async listIntegrations(actor: NtfyActor): Promise<readonly NtfyIntegrationMetadata[]> {
      assertNtfyAccess(actor, "read");
      const records = await listNtfyRecords(deps.store);
      return records.map((record) =>
        Object.freeze({
          id: record.id,
          name: record.name,
          enabled: record.enabled,
        }),
      );
    },
    async getIntegrationMetadata(
      integrationId: string,
      actor: NtfyActor,
    ): Promise<NtfyIntegrationMetadata> {
      assertNtfyAccess(actor, "read");
      const record = await requireNtfyRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: NtfyActor): Promise<NtfyOverview> {
      assertNtfyAccess(actor, "read");
      const record = await requireNtfyRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(integrationId: string, actor: NtfyActor): Promise<NtfyOverview> {
      assertNtfyAccess(actor, "read");
      const record = await requireNtfyRecord(integrationId);
      const recordId = record.id;
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many ntfy refreshes");
      const generation = deps.refreshFence.advance(recordId);
      deps.cache.invalidate(recordId);
      return overviewFor(recordId, generation);
    },
    async publishMessage(input: NtfyPublishInput, actor: NtfyActor): Promise<SafeActionResult> {
      assertNtfyAccess(actor, "publish");
      const topic = assertNtfyTopic(input.topic);
      const message = assertNtfyMessage(input.message);
      const title = assertNtfyTitle(input.title);
      const priority = assertNtfyPriority(input.priority);
      const tags = assertNtfyTags(input.tags);
      const record = await deps.store.findById(input.integrationId);
      if (!record) throw new IntegrationError("NOT_FOUND", "Définition ntfy introuvable");
      const realtime = deps.publish;
      return runSafeIntegrationAction({
        actor,
        action: "ntfy.publish",
        actionPermissions: ["ntfy.publish"],
        integrationId: record.id,
        expectedType: NTFY_INTEGRATION_ID,
        loadedType: record.type,
        resourceId: topic,
        rateLimiter: deps.actionRateLimiter,
        inFlight: deps.inFlight,
        cache: deps.cache,
        currentConfigRevision: record.configRevision,
        ...(input.expectedConfigRevision === undefined
          ? {}
          : { expectedConfigRevision: input.expectedConfigRevision }),
        ...(realtime ? { publish: () => realtime(record.id) } : {}),
        execute: async () => {
          const loaded = await loadContext(record.id, "notifications.publish");
          try {
            await postNtfyPublish(loaded.ctx, {
              topic,
              message,
              priority,
              tags,
              ...(title === undefined ? {} : { title }),
            });
            deps.refreshFence.advance(record.id);
            return "accepted";
          } catch (error) {
            throw normalizedRedactedError(error, loaded.secrets);
          }
        },
      });
    },
  };
}

export type NtfyService = ReturnType<typeof createNtfyService>;
