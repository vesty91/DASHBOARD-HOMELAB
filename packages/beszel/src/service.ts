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
import { assertBeszelAccess, beszelPermissionsView } from "./access";
import { beszelOverviewCacheOperation, overviewFailureCacheOperation } from "./cache-key";
import {
  BESZEL_OVERVIEW_FAILURE_TTL_MS,
  beszelContextFromIntegration,
  fetchBeszelOverview,
  overviewCacheTtl,
  type BeszelClientContext,
} from "./client";
import { BESZEL_INTEGRATION_ID } from "./definition";
import { BeszelError, toIntegrationError } from "./errors";
import type { BeszelOverviewCoalescer } from "./overview-coalescer";
import type { BeszelRefreshFence } from "./refresh-fence";
import type { BeszelConfig, BeszelSecrets } from "./schemas";
import type {
  BeszelActor,
  BeszelIntegrationMetadata,
  BeszelOverview,
  BeszelPermissionsView,
} from "./types";

export interface BeszelServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: BeszelRefreshFence;
  overviewCoalescer: BeszelOverviewCoalescer;
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

type CachedBeszelOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof BeszelError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): BeszelOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as BeszelOverview;
}

function asCachedOverviewFailure(value: unknown): CachedBeszelOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedBeszelOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listBeszelRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === BESZEL_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createBeszelService(deps: BeszelServiceDeps) {
  function definition(): IntegrationDefinition<BeszelConfig, BeszelSecrets> {
    const registered = deps.registry.get(BESZEL_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Beszel definition is not registered");
    return registered as IntegrationDefinition<BeszelConfig, BeszelSecrets>;
  }

  async function requireBeszelRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== BESZEL_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Beszel introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: BeszelClientContext;
    recordId: string;
    secrets: BeszelSecrets;
    cacheOperation: string;
  }> {
    const record = await requireBeszelRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Beszel integration is disabled");
    const beszelDefinition = definition();
    const parsed = beszelDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Beszel configuration");
    requireCapability(beszelDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      beszelDefinition,
      record.id,
      deps.keyring,
    )) as BeszelSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues({ ...secrets, identity: config.identity });
    return {
      recordId: record.id,
      secrets,
      cacheOperation: beszelOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: beszelContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? beszelDefinition.allowedSchemes,
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
  ): Promise<BeszelOverview> {
    const loaded = await loadContext(integrationId, "hosts.read", refreshGeneration);
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
        const overview = await fetchBeszelOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          hosts: Object.freeze(overview.hosts),
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
            BESZEL_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: BeszelActor): BeszelPermissionsView {
      return beszelPermissionsView(actor);
    },
    async listIntegrations(actor: BeszelActor): Promise<readonly BeszelIntegrationMetadata[]> {
      assertBeszelAccess(actor, "read");
      const records = await listBeszelRecords(deps.store);
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
      actor: BeszelActor,
    ): Promise<BeszelIntegrationMetadata> {
      assertBeszelAccess(actor, "read");
      const record = await requireBeszelRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: BeszelActor): Promise<BeszelOverview> {
      assertBeszelAccess(actor, "read");
      const record = await requireBeszelRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(integrationId: string, actor: BeszelActor): Promise<BeszelOverview> {
      assertBeszelAccess(actor, "read");
      const record = await requireBeszelRecord(integrationId);
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", record.id))
        throw new IntegrationError("RATE_LIMITED", "Too many Beszel refreshes");
      const generation = deps.refreshFence.advance(record.id);
      deps.cache.invalidate(record.id);
      return overviewFor(record.id, generation);
    },
  };
}

export type BeszelService = ReturnType<typeof createBeszelService>;
