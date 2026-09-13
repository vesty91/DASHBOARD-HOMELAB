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
import { assertImmichAccess, immichPermissionsView } from "./access";
import { immichOverviewCacheOperation, overviewFailureCacheOperation } from "./cache-key";
import {
  fetchImmichOverview,
  immichContextFromIntegration,
  overviewCacheTtl,
  IMMICH_OVERVIEW_FAILURE_TTL_MS,
  type ImmichClientContext,
} from "./client";
import { IMMICH_INTEGRATION_ID } from "./definition";
import { ImmichError, toIntegrationError } from "./errors";
import type { ImmichOverviewCoalescer } from "./overview-coalescer";
import type { ImmichRefreshFence } from "./refresh-fence";
import type { ImmichConfig, ImmichSecrets } from "./schemas";
import type {
  ImmichActor,
  ImmichIntegrationMetadata,
  ImmichOverview,
  ImmichPermissionsView,
} from "./types";

export interface ImmichServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: ImmichRefreshFence;
  overviewCoalescer: ImmichOverviewCoalescer;
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

type CachedImmichOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof ImmichError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): ImmichOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as ImmichOverview;
}

function asCachedOverviewFailure(value: unknown): CachedImmichOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedImmichOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listImmichRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === IMMICH_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createImmichService(deps: ImmichServiceDeps) {
  function definition(): IntegrationDefinition<ImmichConfig, ImmichSecrets> {
    const registered = deps.registry.get(IMMICH_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Immich definition is not registered");
    return registered as IntegrationDefinition<ImmichConfig, ImmichSecrets>;
  }

  async function requireImmichRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== IMMICH_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Immich introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: ImmichClientContext;
    recordId: string;
    secrets: ImmichSecrets;
    cacheOperation: string;
  }> {
    const record = await requireImmichRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Immich integration is disabled");
    const immichDefinition = definition();
    const parsed = immichDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Immich configuration");
    requireCapability(immichDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      immichDefinition,
      record.id,
      deps.keyring,
    )) as ImmichSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: immichOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: immichContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? immichDefinition.allowedSchemes,
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
  ): Promise<ImmichOverview> {
    const loaded = await loadContext(integrationId, "server.read", refreshGeneration);
    requireCapability(definition().capabilities, "stats.read");
    requireCapability(definition().capabilities, "storage.read");
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
        const overview = await fetchImmichOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          server: Object.freeze(overview.server),
          health: Object.freeze(overview.health),
          storage: Object.freeze(overview.storage),
          stats: Object.freeze(overview.stats),
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
            IMMICH_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: ImmichActor): ImmichPermissionsView {
      return immichPermissionsView(actor);
    },
    async listIntegrations(actor: ImmichActor): Promise<readonly ImmichIntegrationMetadata[]> {
      assertImmichAccess(actor, "read");
      const records = await listImmichRecords(deps.store);
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
      actor: ImmichActor,
    ): Promise<ImmichIntegrationMetadata> {
      assertImmichAccess(actor, "read");
      const record = await requireImmichRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: ImmichActor): Promise<ImmichOverview> {
      assertImmichAccess(actor, "read");
      const record = await requireImmichRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(integrationId: string, actor: ImmichActor): Promise<ImmichOverview> {
      assertImmichAccess(actor, "read");
      const record = await requireImmichRecord(integrationId);
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Immich refreshes");
      const generation = deps.refreshFence.advance(record.id);
      deps.cache.invalidate(record.id);
      return overviewFor(record.id, generation);
    },
  };
}

export type ImmichService = ReturnType<typeof createImmichService>;
