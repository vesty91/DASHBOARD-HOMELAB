import {
  DEFAULT_TIMEOUT_MS,
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
  type IntegrationRateLimiter,
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
  type SynologyClientContext,
} from "./client";
import { synologyOverviewCacheOperation } from "./cache-key";
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

function redactError(error: unknown, secrets: unknown): never {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError) {
    throw new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  }
  if (error instanceof SynologyError) {
    throw new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  }
  throw error;
}

export function createSynologyService(deps: SynologyServiceDeps) {
  function definition(): IntegrationDefinition<SynologyConfig, SynologySecrets> {
    const registered = deps.registry.get(SYNOLOGY_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Synology definition is not registered");
    return registered as IntegrationDefinition<SynologyConfig, SynologySecrets>;
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
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== SYNOLOGY_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Synology introuvable");
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
    const cached = deps.cache.get(loaded.recordId, loaded.cacheOperation) as
      SynologyOverview | undefined;
    if (cached) return cached;
    return deps.overviewCoalescer.run(`${loaded.recordId}:${loaded.cacheOperation}`, async () => {
      const rechecked = deps.cache.get(loaded.recordId, loaded.cacheOperation) as
        SynologyOverview | undefined;
      if (rechecked) return rechecked;
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
        redactError(error, { ...loaded.secrets, account: loaded.ctx.account });
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
      const record = await deps.store.findById(integrationId);
      if (!record || record.type !== SYNOLOGY_INTEGRATION_ID)
        throw new IntegrationError("NOT_FOUND", "Définition Synology introuvable");
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: SynologyActor): Promise<SynologyOverview> {
      assertSynologyAccess(actor, "read");
      return overviewFor(integrationId, deps.refreshFence.current(integrationId));
    },
    async refreshOverview(integrationId: string, actor: SynologyActor): Promise<SynologyOverview> {
      assertSynologyAccess(actor, "read");
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", integrationId))
        throw new IntegrationError("RATE_LIMITED", "Too many Synology refreshes");
      const generation = deps.refreshFence.advance(integrationId);
      deps.cache.invalidate(integrationId);
      return overviewFor(integrationId, generation);
    },
    async enrollDevice(
      integrationId: string,
      otpCode: string,
      actor: SynologyActor,
    ): Promise<{ enrolled: true }> {
      assertSynologyAccess(actor, "manageAuth");
      const loaded = await loadContext(integrationId, "system.read");
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
      const record = await deps.store.findById(integrationId);
      if (!record || record.type !== SYNOLOGY_INTEGRATION_ID)
        throw new IntegrationError("NOT_FOUND", "Définition Synology introuvable");
      await clearServerManagedSecret(deps.store, definition(), record.id, DEVICE_SECRET_KEY);
      deps.cache.invalidate(record.id);
      return { cleared: true };
    },
  };
}

export type SynologyService = ReturnType<typeof createSynologyService>;
