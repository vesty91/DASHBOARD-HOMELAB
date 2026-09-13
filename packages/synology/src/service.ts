import {
  DEFAULT_TIMEOUT_MS,
  INTEGRATION_ERROR_CODES,
  IntegrationError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  clearServerManagedSecret,
  collectSecretStringValues,
  loadIntegrationSecrets,
  persistServerManagedSecretIfRevision,
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
import { assertSynologyAccess, synologyPermissionsView } from "./access";
import {
  enrollTrustedDevice,
  fetchSynologyOverview,
  overviewCacheTtl,
  synologyContextFromIntegration,
  SYNOLOGY_OVERVIEW_FAILURE_TTL_MS,
  type SynologyClientContext,
} from "./client";
import { overviewFailureCacheOperation, synologyOverviewCacheOperation } from "./cache-key";
import { SYNOLOGY_INTEGRATION_ID } from "./definition";
import { SynologyError, toIntegrationError } from "./errors";
import type { SynologyOverviewCoalescer } from "./overview-coalescer";
import type { SynologyRefreshFence } from "./refresh-fence";
import type { SynologyConfig, SynologySecrets } from "./schemas";
import type {
  SynologyActor,
  SynologyIntegrationMetadata,
  SynologyOverview,
  SynologyPermissionsView,
} from "./types";

const DEVICE_SECRET_KEY = "deviceId";

export interface SynologyServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  enrollmentRateLimiter: IntegrationRateLimiter;
  refreshFence: SynologyRefreshFence;
  overviewCoalescer: SynologyOverviewCoalescer;
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

type CachedSynologyOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof SynologyError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function redactError(error: unknown, secrets: unknown): never {
  throw normalizedRedactedError(error, secrets);
}

function asCachedOverview(value: unknown): SynologyOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as SynologyOverview;
}

function asCachedOverviewFailure(value: unknown): CachedSynologyOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedSynologyOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

function readCachedOverview(
  cache: IntegrationCache,
  recordId: string,
  cacheOperation: string,
): SynologyOverview | undefined {
  return asCachedOverview(cache.get(recordId, cacheOperation));
}

function readCachedOverviewFailure(
  cache: IntegrationCache,
  recordId: string,
  cacheOperation: string,
): CachedSynologyOverviewFailure | undefined {
  return asCachedOverviewFailure(
    cache.get(recordId, overviewFailureCacheOperation(cacheOperation)),
  );
}

export function createSynologyService(deps: SynologyServiceDeps) {
  function definition(): IntegrationDefinition<SynologyConfig, SynologySecrets> {
    const registered = deps.registry.get(SYNOLOGY_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Synology definition is not registered");
    return registered as IntegrationDefinition<SynologyConfig, SynologySecrets>;
  }

  async function requireSynologyRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== SYNOLOGY_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Synology introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: SynologyClientContext;
    recordId: string;
    secrets: SynologySecrets;
    cacheOperation: string;
    configRevision: number;
  }> {
    const record = await requireSynologyRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Synology integration is disabled");
    const synologyDefinition = definition();
    const parsed = synologyDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Synology configuration");
    requireCapability(synologyDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      synologyDefinition,
      record.id,
      deps.keyring,
    )) as SynologySecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    return {
      recordId: record.id,
      secrets,
      configRevision: record.configRevision,
      cacheOperation: synologyOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: synologyContextFromIntegration({
        integrationId: record.id,
        baseUrl: record.baseUrl,
        config,
        secrets,
        verifyTls: verifyTlsFromConfig(config as JsonObject),
        timeoutMs: timeoutFromConfig(config as JsonObject),
        request: (options) =>
          deps.request({
            ...options,
            verifyTls: options.verifyTls ?? verifyTlsFromConfig(config as JsonObject),
            timeoutMs: options.timeoutMs ?? timeoutFromConfig(config as JsonObject),
            allowedSchemes: options.allowedSchemes ?? synologyDefinition.allowedSchemes,
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
  ): Promise<SynologyOverview> {
    const loaded = await loadContext(integrationId, "system.read", refreshGeneration);
    requireCapability(definition().capabilities, "resources.read");
    requireCapability(definition().capabilities, "storage.read");
    const cached = readCachedOverview(deps.cache, loaded.recordId, loaded.cacheOperation);
    if (cached) return cached;
    const cachedFailure = readCachedOverviewFailure(
      deps.cache,
      loaded.recordId,
      loaded.cacheOperation,
    );
    if (cachedFailure) throwCachedFailure(cachedFailure);
    return deps.overviewCoalescer.run(`${loaded.recordId}:${loaded.cacheOperation}`, async () => {
      const rechecked = readCachedOverview(deps.cache, loaded.recordId, loaded.cacheOperation);
      if (rechecked) return rechecked;
      const recheckedFailure = readCachedOverviewFailure(
        deps.cache,
        loaded.recordId,
        loaded.cacheOperation,
      );
      if (recheckedFailure) throwCachedFailure(recheckedFailure);
      try {
        const overview = await fetchSynologyOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          system: Object.freeze(overview.system),
          resources: Object.freeze(overview.resources),
          storage: Object.freeze(overview.storage),
        });
        if (deps.refreshFence.current(integrationId) === refreshGeneration)
          deps.cache.set(loaded.recordId, loaded.cacheOperation, frozen, overviewCacheTtl(frozen));
        return frozen;
      } catch (error) {
        const safe = normalizedRedactedError(error, {
          ...loaded.secrets,
          account: loaded.ctx.account,
        });
        if (deps.refreshFence.current(integrationId) === refreshGeneration)
          deps.cache.set(
            loaded.recordId,
            overviewFailureCacheOperation(loaded.cacheOperation),
            { code: safe.code, message: safe.message },
            SYNOLOGY_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  return {
    permissions(actor: SynologyActor): SynologyPermissionsView {
      return synologyPermissionsView(actor);
    },
    async getIntegrationMetadata(
      integrationId: string,
      actor: SynologyActor,
    ): Promise<SynologyIntegrationMetadata> {
      assertSynologyAccess(actor, "read");
      const record = await requireSynologyRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: SynologyActor): Promise<SynologyOverview> {
      assertSynologyAccess(actor, "read");
      const record = await requireSynologyRecord(integrationId);
      const recordId = record.id;
      return overviewFor(recordId, deps.refreshFence.current(recordId));
    },
    async refreshOverview(integrationId: string, actor: SynologyActor): Promise<SynologyOverview> {
      assertSynologyAccess(actor, "read");
      const record = await requireSynologyRecord(integrationId);
      const recordId = record.id;
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many Synology refreshes");
      const generation = deps.refreshFence.advance(recordId);
      deps.cache.invalidate(recordId);
      return overviewFor(recordId, generation);
    },
    async enrollDevice(
      integrationId: string,
      otpCode: string,
      actor: SynologyActor,
    ): Promise<{ enrolled: true }> {
      assertSynologyAccess(actor, "manageAuth");
      const loaded = await loadContext(integrationId, "system.read");
      const userId = actor.userId;
      if (!userId) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
      if (!deps.enrollmentRateLimiter.tryConsume(userId, loaded.recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many Synology device enrollment attempts");
      try {
        const enrolled = await enrollTrustedDevice(loaded.ctx, otpCode);
        const persisted = await persistServerManagedSecretIfRevision(
          deps.store,
          definition(),
          loaded.recordId,
          DEVICE_SECRET_KEY,
          enrolled.did,
          loaded.configRevision,
          deps.keyring,
        );
        if (!persisted)
          throw new IntegrationError(
            "STALE_RESULT",
            "Synology configuration changed during device enrollment",
          );
        deps.cache.invalidate(loaded.recordId);
        return { enrolled: true };
      } catch (error) {
        redactError(error, { ...loaded.secrets, otpCode, account: loaded.ctx.account });
      }
    },
    async clearDevice(integrationId: string, actor: SynologyActor): Promise<{ cleared: true }> {
      assertSynologyAccess(actor, "manageAuth");
      const record = await requireSynologyRecord(integrationId);
      await clearServerManagedSecret(deps.store, definition(), record.id, DEVICE_SECRET_KEY);
      deps.cache.invalidate(record.id);
      return { cleared: true };
    },
  };
}

export type SynologyService = ReturnType<typeof createSynologyService>;
