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
import { assertGrafanaAccess, grafanaPermissionsView } from "./access";
import { grafanaOverviewCacheOperation, overviewFailureCacheOperation } from "./cache-key";
import {
  GRAFANA_OVERVIEW_FAILURE_TTL_MS,
  fetchGrafanaOverview,
  grafanaContextFromIntegration,
  overviewCacheTtl,
  type GrafanaClientContext,
} from "./client";
import { GRAFANA_INTEGRATION_ID } from "./definition";
import { GrafanaError, toIntegrationError } from "./errors";
import type { GrafanaOverviewCoalescer } from "./overview-coalescer";
import type { GrafanaRefreshFence } from "./refresh-fence";
import type { GrafanaConfig, GrafanaSecrets } from "./schemas";
import type {
  GrafanaActor,
  GrafanaIntegrationMetadata,
  GrafanaOverview,
  GrafanaPermissionsView,
} from "./types";

export interface GrafanaServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: GrafanaRefreshFence;
  overviewCoalescer: GrafanaOverviewCoalescer;
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

type CachedGrafanaOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof GrafanaError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): GrafanaOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as GrafanaOverview;
}

function asCachedOverviewFailure(value: unknown): CachedGrafanaOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedGrafanaOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listGrafanaRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === GRAFANA_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createGrafanaService(deps: GrafanaServiceDeps) {
  function definition(): IntegrationDefinition<GrafanaConfig, GrafanaSecrets> {
    const registered = deps.registry.get(GRAFANA_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Grafana definition is not registered");
    return registered as IntegrationDefinition<GrafanaConfig, GrafanaSecrets>;
  }

  async function requireGrafanaRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== GRAFANA_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Grafana introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: GrafanaClientContext;
    recordId: string;
    secrets: GrafanaSecrets;
    cacheOperation: string;
  }> {
    const record = await requireGrafanaRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Grafana integration is disabled");
    const grafanaDefinition = definition();
    const parsed = grafanaDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Grafana configuration");
    requireCapability(grafanaDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      grafanaDefinition,
      record.id,
      deps.keyring,
    )) as GrafanaSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: grafanaOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: grafanaContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? grafanaDefinition.allowedSchemes,
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
  ): Promise<GrafanaOverview> {
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
        const overview = await fetchGrafanaOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          health: Object.freeze(overview.health),
          dashboards: Object.freeze(overview.dashboards),
          folders: Object.freeze(overview.folders),
          alerts: Object.freeze(overview.alerts),
          datasources: Object.freeze(overview.datasources),
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
            GRAFANA_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: GrafanaActor): GrafanaPermissionsView {
      return grafanaPermissionsView(actor);
    },
    async listIntegrations(actor: GrafanaActor): Promise<readonly GrafanaIntegrationMetadata[]> {
      assertGrafanaAccess(actor, "read");
      const records = await listGrafanaRecords(deps.store);
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
      actor: GrafanaActor,
    ): Promise<GrafanaIntegrationMetadata> {
      assertGrafanaAccess(actor, "read");
      const record = await requireGrafanaRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: GrafanaActor): Promise<GrafanaOverview> {
      assertGrafanaAccess(actor, "read");
      const record = await requireGrafanaRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(integrationId: string, actor: GrafanaActor): Promise<GrafanaOverview> {
      assertGrafanaAccess(actor, "read");
      const record = await requireGrafanaRecord(integrationId);
      const recordId = record.id;
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many Grafana refreshes");
      const generation = deps.refreshFence.advance(recordId);
      deps.cache.invalidate(recordId);
      return overviewFor(recordId, generation);
    },
  };
}

export type GrafanaService = ReturnType<typeof createGrafanaService>;
