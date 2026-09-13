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
import { assertPrometheusAccess, prometheusPermissionsView } from "./access";
import {
  overviewFailureCacheOperation,
  prometheusQueryCacheOperation,
  prometheusQueryFingerprint,
} from "./cache-key";
import {
  PROMETHEUS_OVERVIEW_FAILURE_TTL_MS,
  executePrometheusQuery,
  fetchPrometheusOverview,
  overviewCacheTtl,
  prometheusContextFromIntegration,
  type PrometheusClientContext,
} from "./client";
import { PROMETHEUS_INTEGRATION_ID } from "./definition";
import { PrometheusError, toIntegrationError } from "./errors";
import type { PrometheusOverviewCoalescer } from "./overview-coalescer";
import type { PrometheusRefreshFence } from "./refresh-fence";
import {
  PROMETHEUS_OVERVIEW_QUERY,
  parsePrometheusInstantQuery,
  parsePrometheusRangeQuery,
  type PrometheusConfig,
  type PrometheusInstantQueryInput,
  type PrometheusRangeQueryInput,
  type PrometheusSecrets,
} from "./schemas";
import type {
  PrometheusActor,
  PrometheusIntegrationMetadata,
  PrometheusPermissionsView,
  PrometheusQueryDto,
  PrometheusValidatedQuery,
} from "./types";

export interface PrometheusServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  queryRateLimiter: IntegrationRateLimiter;
  refreshFence: PrometheusRefreshFence;
  overviewCoalescer: PrometheusOverviewCoalescer;
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

type CachedPrometheusQueryFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof PrometheusError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedQuery(value: unknown): PrometheusQueryDto | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value) || !("resultType" in value))
    return undefined;
  return value as PrometheusQueryDto;
}

function asCachedQueryFailure(value: unknown): CachedPrometheusQueryFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedPrometheusQueryFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listPrometheusRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === PROMETHEUS_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createPrometheusService(deps: PrometheusServiceDeps) {
  function definition(): IntegrationDefinition<PrometheusConfig, PrometheusSecrets> {
    const registered = deps.registry.get(PROMETHEUS_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Prometheus definition is not registered");
    return registered as IntegrationDefinition<PrometheusConfig, PrometheusSecrets>;
  }

  async function requirePrometheusRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== PROMETHEUS_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Prometheus introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    query: PrometheusValidatedQuery,
    refreshGeneration = 0,
  ): Promise<{
    ctx: PrometheusClientContext;
    recordId: string;
    secrets: PrometheusSecrets;
    cacheOperation: string;
  }> {
    const record = await requirePrometheusRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Prometheus integration is disabled");
    const prometheusDefinition = definition();
    const parsed = prometheusDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Prometheus configuration");
    requireCapability(prometheusDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      prometheusDefinition,
      record.id,
      deps.keyring,
    )) as PrometheusSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: prometheusQueryCacheOperation(
        record.configRevision,
        encryptedSecrets,
        prometheusQueryFingerprint(query),
        refreshGeneration,
      ),
      ctx: prometheusContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? prometheusDefinition.allowedSchemes,
            maxRetries: 0,
            maxRedirects: 0,
            ...(trustedCaPem === undefined || options.trustedCaPem !== undefined
              ? {}
              : { trustedCaPem }),
          }),
      }),
    };
  }

  async function queryFor(
    integrationId: string,
    query: PrometheusValidatedQuery,
    refreshGeneration: number,
  ): Promise<PrometheusQueryDto> {
    const loaded = await loadContext(integrationId, "query.read", query, refreshGeneration);
    const cached = asCachedQuery(deps.cache.get(loaded.recordId, loaded.cacheOperation));
    if (cached) return cached;
    const cachedFailure = asCachedQueryFailure(
      deps.cache.get(loaded.recordId, overviewFailureCacheOperation(loaded.cacheOperation)),
    );
    if (cachedFailure) throwCachedFailure(cachedFailure);
    return deps.overviewCoalescer.run(`${loaded.recordId}:${loaded.cacheOperation}`, async () => {
      const rechecked = asCachedQuery(deps.cache.get(loaded.recordId, loaded.cacheOperation));
      if (rechecked) return rechecked;
      const recheckedFailure = asCachedQueryFailure(
        deps.cache.get(loaded.recordId, overviewFailureCacheOperation(loaded.cacheOperation)),
      );
      if (recheckedFailure) throwCachedFailure(recheckedFailure);
      try {
        const result =
          query.mode === "instant" && query.query === PROMETHEUS_OVERVIEW_QUERY
            ? await fetchPrometheusOverview(loaded.ctx)
            : await executePrometheusQuery(loaded.ctx, query);
        const frozen = Object.freeze({
          resultType: result.resultType,
          series: Object.freeze(result.series.map((series) => Object.freeze({ ...series }))),
          truncated: result.truncated,
          seriesCount: result.seriesCount,
          sampleCount: result.sampleCount,
          fetchedAt: result.fetchedAt,
          status: result.status,
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
            PROMETHEUS_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  const overviewQuery: PrometheusValidatedQuery = {
    mode: "instant",
    query: PROMETHEUS_OVERVIEW_QUERY,
  };

  return {
    permissions(actor: PrometheusActor): PrometheusPermissionsView {
      return prometheusPermissionsView(actor);
    },
    async listIntegrations(
      actor: PrometheusActor,
    ): Promise<readonly PrometheusIntegrationMetadata[]> {
      assertPrometheusAccess(actor, "read");
      const records = await listPrometheusRecords(deps.store);
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
      actor: PrometheusActor,
    ): Promise<PrometheusIntegrationMetadata> {
      assertPrometheusAccess(actor, "read");
      const record = await requirePrometheusRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: PrometheusActor): Promise<PrometheusQueryDto> {
      assertPrometheusAccess(actor, "read");
      const record = await requirePrometheusRecord(integrationId);
      return queryFor(record.id, overviewQuery, deps.refreshFence.current(record.id));
    },
    async refreshOverview(
      integrationId: string,
      actor: PrometheusActor,
    ): Promise<PrometheusQueryDto> {
      assertPrometheusAccess(actor, "read");
      const record = await requirePrometheusRecord(integrationId);
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Prometheus refreshes");
      const generation = deps.refreshFence.advance(record.id);
      deps.cache.invalidate(record.id);
      return queryFor(record.id, overviewQuery, generation);
    },
    async queryInstant(
      input: PrometheusInstantQueryInput,
      actor: PrometheusActor,
    ): Promise<PrometheusQueryDto> {
      assertPrometheusAccess(actor, "read");
      const query = parsePrometheusInstantQuery(input);
      const record = await requirePrometheusRecord(input.integrationId);
      if (!deps.queryRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Prometheus queries");
      return queryFor(record.id, query, deps.refreshFence.current(record.id));
    },
    async queryRange(
      input: PrometheusRangeQueryInput,
      actor: PrometheusActor,
    ): Promise<PrometheusQueryDto> {
      assertPrometheusAccess(actor, "read");
      const query = parsePrometheusRangeQuery(input);
      const record = await requirePrometheusRecord(input.integrationId);
      if (!deps.queryRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Prometheus queries");
      return queryFor(record.id, query, deps.refreshFence.current(record.id));
    },
  };
}

export type PrometheusService = ReturnType<typeof createPrometheusService>;
