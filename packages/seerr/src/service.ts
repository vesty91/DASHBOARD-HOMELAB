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
import { assertSeerrAccess, seerrPermissionsView } from "./access";
import { seerrOverviewCacheOperation, overviewFailureCacheOperation } from "./cache-key";
import {
  SEERR_OVERVIEW_FAILURE_TTL_MS,
  fetchSeerrOverview,
  seerrContextFromIntegration,
  overviewCacheTtl,
  type SeerrClientContext,
} from "./client";
import { SEERR_INTEGRATION_ID } from "./definition";
import { SeerrError, toIntegrationError } from "./errors";
import type { SeerrOverviewCoalescer } from "./overview-coalescer";
import type { SeerrRefreshFence } from "./refresh-fence";
import type { SeerrConfig, SeerrSecrets } from "./schemas";
import type {
  SeerrActor,
  SeerrIntegrationMetadata,
  SeerrOverview,
  SeerrPermissionsView,
} from "./types";

export interface SeerrServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: SeerrRefreshFence;
  overviewCoalescer: SeerrOverviewCoalescer;
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

type CachedSeerrOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof SeerrError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): SeerrOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as SeerrOverview;
}

function asCachedOverviewFailure(value: unknown): CachedSeerrOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedSeerrOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listSeerrRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === SEERR_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createSeerrService(deps: SeerrServiceDeps) {
  function definition(): IntegrationDefinition<SeerrConfig, SeerrSecrets> {
    const registered = deps.registry.get(SEERR_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Seerr definition is not registered");
    return registered as IntegrationDefinition<SeerrConfig, SeerrSecrets>;
  }

  async function requireSeerrRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== SEERR_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Seerr introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: SeerrClientContext;
    recordId: string;
    secrets: SeerrSecrets;
    cacheOperation: string;
  }> {
    const record = await requireSeerrRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Seerr integration is disabled");
    const seerrDefinition = definition();
    const parsed = seerrDefinition.configSchema.safeParse(record.config);
    if (!parsed.success) throw new IntegrationError("MISCONFIGURED", "Invalid Seerr configuration");
    requireCapability(seerrDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      seerrDefinition,
      record.id,
      deps.keyring,
    )) as SeerrSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: seerrOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: seerrContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? seerrDefinition.allowedSchemes,
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
  ): Promise<SeerrOverview> {
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
        const overview = await fetchSeerrOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          system: Object.freeze(overview.system),
          counts: Object.freeze(overview.counts),
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
            SEERR_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: SeerrActor): SeerrPermissionsView {
      return seerrPermissionsView(actor);
    },
    async listIntegrations(actor: SeerrActor): Promise<readonly SeerrIntegrationMetadata[]> {
      assertSeerrAccess(actor, "read");
      const records = await listSeerrRecords(deps.store);
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
      actor: SeerrActor,
    ): Promise<SeerrIntegrationMetadata> {
      assertSeerrAccess(actor, "read");
      const record = await requireSeerrRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: SeerrActor): Promise<SeerrOverview> {
      assertSeerrAccess(actor, "read");
      const record = await requireSeerrRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(integrationId: string, actor: SeerrActor): Promise<SeerrOverview> {
      assertSeerrAccess(actor, "read");
      const record = await requireSeerrRecord(integrationId);
      const recordId = record.id;
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many Seerr refreshes");
      const generation = deps.refreshFence.advance(recordId);
      deps.cache.invalidate(recordId);
      return overviewFor(recordId, generation);
    },
  };
}

export type SeerrService = ReturnType<typeof createSeerrService>;
