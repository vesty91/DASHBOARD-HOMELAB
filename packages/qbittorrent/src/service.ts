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
import { assertQbittorrentAccess, qbittorrentPermissionsView } from "./access";
import { qbittorrentOverviewCacheOperation, overviewFailureCacheOperation } from "./cache-key";
import {
  QBITTORRENT_OVERVIEW_FAILURE_TTL_MS,
  fetchQbittorrentOverview,
  qbittorrentContextFromIntegration,
  overviewCacheTtl,
  type QbittorrentClientContext,
} from "./client";
import { QBITTORRENT_INTEGRATION_ID } from "./definition";
import { QbittorrentError, toIntegrationError } from "./errors";
import type { QbittorrentOverviewCoalescer } from "./overview-coalescer";
import type { QbittorrentRefreshFence } from "./refresh-fence";
import type { QbittorrentConfig, QbittorrentSecrets } from "./schemas";
import type {
  QbittorrentActor,
  QbittorrentIntegrationMetadata,
  QbittorrentOverview,
  QbittorrentPermissionsView,
} from "./types";

export interface QbittorrentServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: QbittorrentRefreshFence;
  overviewCoalescer: QbittorrentOverviewCoalescer;
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

type CachedQbittorrentOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof QbittorrentError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): QbittorrentOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as QbittorrentOverview;
}

function asCachedOverviewFailure(value: unknown): CachedQbittorrentOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedQbittorrentOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listQbittorrentRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records)
      if (record.type === QBITTORRENT_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createQbittorrentService(deps: QbittorrentServiceDeps) {
  function definition(): IntegrationDefinition<QbittorrentConfig, QbittorrentSecrets> {
    const registered = deps.registry.get(QBITTORRENT_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "qBittorrent definition is not registered");
    return registered as IntegrationDefinition<QbittorrentConfig, QbittorrentSecrets>;
  }

  async function requireQbittorrentRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== QBITTORRENT_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition qBittorrent introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: QbittorrentClientContext;
    recordId: string;
    secrets: QbittorrentSecrets;
    cacheOperation: string;
  }> {
    const record = await requireQbittorrentRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "qBittorrent integration is disabled");
    const qbittorrentDefinition = definition();
    const parsed = qbittorrentDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid qBittorrent configuration");
    requireCapability(qbittorrentDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      qbittorrentDefinition,
      record.id,
      deps.keyring,
    )) as QbittorrentSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: qbittorrentOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: qbittorrentContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? qbittorrentDefinition.allowedSchemes,
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
  ): Promise<QbittorrentOverview> {
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
        const overview = await fetchQbittorrentOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          version: Object.freeze(overview.version),
          transfer: Object.freeze(overview.transfer),
          torrents: Object.freeze(overview.torrents),
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
            QBITTORRENT_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: QbittorrentActor): QbittorrentPermissionsView {
      return qbittorrentPermissionsView(actor);
    },
    async listIntegrations(
      actor: QbittorrentActor,
    ): Promise<readonly QbittorrentIntegrationMetadata[]> {
      assertQbittorrentAccess(actor, "read");
      const records = await listQbittorrentRecords(deps.store);
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
      actor: QbittorrentActor,
    ): Promise<QbittorrentIntegrationMetadata> {
      assertQbittorrentAccess(actor, "read");
      const record = await requireQbittorrentRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(
      integrationId: string,
      actor: QbittorrentActor,
    ): Promise<QbittorrentOverview> {
      assertQbittorrentAccess(actor, "read");
      const record = await requireQbittorrentRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(
      integrationId: string,
      actor: QbittorrentActor,
    ): Promise<QbittorrentOverview> {
      assertQbittorrentAccess(actor, "read");
      const record = await requireQbittorrentRecord(integrationId);
      const recordId = record.id;
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many qBittorrent refreshes");
      const generation = deps.refreshFence.advance(recordId);
      deps.cache.invalidate(recordId);
      return overviewFor(recordId, generation);
    },
  };
}

export type QbittorrentService = ReturnType<typeof createQbittorrentService>;
