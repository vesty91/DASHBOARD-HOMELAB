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
import type { Permission } from "@dashboard/permissions";
import { assertProxmoxAccess, proxmoxPermissionsView } from "./access";
import { overviewFailureCacheOperation, proxmoxOverviewCacheOperation } from "./cache-key";
import {
  PROXMOX_OVERVIEW_FAILURE_TTL_MS,
  fetchProxmoxGuestPowerStatus,
  fetchProxmoxOverview,
  overviewCacheTtl,
  postProxmoxGuestPower,
  proxmoxContextFromIntegration,
  type ProxmoxClientContext,
} from "./client";
import { PROXMOX_INTEGRATION_ID } from "./definition";
import { ProxmoxError, toIntegrationError } from "./errors";
import {
  assertProxmoxGuestType,
  assertProxmoxNodeName,
  assertProxmoxVmid,
  proxmoxGuestResourceId,
} from "./guest-path";
import type { ProxmoxOverviewCoalescer } from "./overview-coalescer";
import type { ProxmoxRefreshFence } from "./refresh-fence";
import type { ProxmoxConfig, ProxmoxGuestActionInput, ProxmoxSecrets } from "./schemas";
import type {
  ProxmoxActor,
  ProxmoxGuestPowerAction,
  ProxmoxIntegrationMetadata,
  ProxmoxOverview,
  ProxmoxPermissionsView,
} from "./types";

export interface ProxmoxServiceDeps {
  store: IntegrationStore;
  registry: IntegrationRegistry;
  cache: IntegrationCache;
  request: (options: SecureHttpRequest) => Promise<SecureHttpResult>;
  refreshRateLimiter: IntegrationRateLimiter;
  refreshFence: ProxmoxRefreshFence;
  overviewCoalescer: ProxmoxOverviewCoalescer;
  actionRateLimiter: SafeActionRateLimiter;
  inFlight: SafeActionInFlightGuard;
  publish?: (integrationId: string) => Promise<void>;
  keyring?: Parameters<typeof loadIntegrationSecrets>[3];
}

const GUEST_ACTION_PERMISSION: Record<ProxmoxGuestPowerAction, Permission> = {
  start: "proxmox.start",
  shutdown: "proxmox.shutdown",
  reboot: "proxmox.reboot",
};

const GUEST_ACTION_CAPABILITY: Record<ProxmoxGuestPowerAction, string> = {
  start: "guests.start",
  shutdown: "guests.shutdown",
  reboot: "guests.reboot",
};

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

type CachedProxmoxOverviewFailure = Readonly<{
  code: IntegrationErrorCode;
  message: string;
}>;

function normalizedRedactedError(error: unknown, secrets: unknown): IntegrationError {
  const values = collectSecretStringValues(secrets);
  if (error instanceof IntegrationError)
    return new IntegrationError(error.code, String(redactKnownSecretValues(error.message, values)));
  if (error instanceof ProxmoxError)
    return new IntegrationError(
      toIntegrationError(error).code,
      String(redactKnownSecretValues(error.message, values)),
    );
  throw error;
}

function asCachedOverview(value: unknown): ProxmoxOverview | undefined {
  if (!value || typeof value !== "object" || !("fetchedAt" in value)) return undefined;
  return value as ProxmoxOverview;
}

function asCachedOverviewFailure(value: unknown): CachedProxmoxOverviewFailure | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string" || typeof record.message !== "string") return undefined;
  if (!(INTEGRATION_ERROR_CODES as readonly string[]).includes(record.code)) return undefined;
  return { code: record.code as IntegrationErrorCode, message: record.message };
}

function throwCachedFailure(failure: CachedProxmoxOverviewFailure): never {
  throw new IntegrationError(failure.code, failure.message);
}

const LIST_PAGE_SIZE = 100;
const LIST_MAX_PAGES = 100;

async function listProxmoxRecords(store: IntegrationStore): Promise<IntegrationRecord[]> {
  const found: IntegrationRecord[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < LIST_MAX_PAGES; page += 1) {
    const records = await store.list(LIST_PAGE_SIZE, cursor);
    for (const record of records) if (record.type === PROXMOX_INTEGRATION_ID) found.push(record);
    if (records.length < LIST_PAGE_SIZE) return found;
    const nextCursor = records[records.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor) return found;
    cursor = nextCursor;
  }
  return found;
}

export function createProxmoxService(deps: ProxmoxServiceDeps) {
  function definition(): IntegrationDefinition<ProxmoxConfig, ProxmoxSecrets> {
    const registered = deps.registry.get(PROXMOX_INTEGRATION_ID);
    if (!registered)
      throw new IntegrationError("MISCONFIGURED", "Proxmox definition is not registered");
    return registered as IntegrationDefinition<ProxmoxConfig, ProxmoxSecrets>;
  }

  async function requireProxmoxRecord(integrationId: string): Promise<IntegrationRecord> {
    const record = await deps.store.findById(integrationId);
    if (!record || record.type !== PROXMOX_INTEGRATION_ID)
      throw new IntegrationError("NOT_FOUND", "Définition Proxmox introuvable");
    return record;
  }

  async function loadContext(
    integrationId: string,
    capability: string,
    refreshGeneration = 0,
  ): Promise<{
    ctx: ProxmoxClientContext;
    recordId: string;
    secrets: ProxmoxSecrets;
    cacheOperation: string;
  }> {
    const record = await requireProxmoxRecord(integrationId);
    if (!record.enabled)
      throw new IntegrationError("MISCONFIGURED", "Proxmox integration is disabled");
    const proxmoxDefinition = definition();
    const parsed = proxmoxDefinition.configSchema.safeParse(record.config);
    if (!parsed.success)
      throw new IntegrationError("MISCONFIGURED", "Invalid Proxmox configuration");
    requireCapability(proxmoxDefinition.capabilities, capability);
    const config = parsed.data;
    const secrets = (await loadIntegrationSecrets(
      deps.store,
      proxmoxDefinition,
      record.id,
      deps.keyring,
    )) as ProxmoxSecrets;
    const encryptedSecrets = await deps.store.loadEncryptedSecrets(record.id);
    const trustedCaPem = trustedCaFromConfig(config as JsonObject);
    const secretValues = collectSecretStringValues(secrets);
    return {
      recordId: record.id,
      secrets,
      cacheOperation: proxmoxOverviewCacheOperation(
        record.configRevision,
        encryptedSecrets,
        refreshGeneration,
      ),
      ctx: proxmoxContextFromIntegration({
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
            allowedSchemes: options.allowedSchemes ?? proxmoxDefinition.allowedSchemes,
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
  ): Promise<ProxmoxOverview> {
    const loaded = await loadContext(integrationId, "cluster.read", refreshGeneration);
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
        const overview = await fetchProxmoxOverview(loaded.ctx);
        const frozen = Object.freeze({
          status: overview.status,
          fetchedAt: overview.fetchedAt,
          version: Object.freeze(overview.version),
          cluster: Object.freeze(overview.cluster),
          nodes: Object.freeze(overview.nodes),
          guests: Object.freeze(overview.guests),
          storage: Object.freeze(overview.storage),
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
            PROXMOX_OVERVIEW_FAILURE_TTL_MS,
          );
        throw safe;
      }
    });
  }

  async function runGuestPower(
    action: ProxmoxGuestPowerAction,
    input: ProxmoxGuestActionInput,
    actor: ProxmoxActor,
  ): Promise<SafeActionResult> {
    assertProxmoxAccess(actor, action);
    const node = assertProxmoxNodeName(input.node);
    const guestType = assertProxmoxGuestType(input.guestType);
    const vmid = assertProxmoxVmid(input.vmid);
    const record = await deps.store.findById(input.integrationId);
    if (!record) throw new IntegrationError("NOT_FOUND", "Définition Proxmox introuvable");
    const resourceId = proxmoxGuestResourceId(node, guestType, vmid);
    const publish = deps.publish;
    return runSafeIntegrationAction({
      actor,
      action: `proxmox.${action}`,
      actionPermissions: [GUEST_ACTION_PERMISSION[action]],
      integrationId: record.id,
      expectedType: PROXMOX_INTEGRATION_ID,
      loadedType: record.type,
      resourceId,
      rateLimiter: deps.actionRateLimiter,
      inFlight: deps.inFlight,
      cache: deps.cache,
      currentConfigRevision: record.configRevision,
      ...(input.expectedConfigRevision === undefined
        ? {}
        : { expectedConfigRevision: input.expectedConfigRevision }),
      ...(publish ? { publish: () => publish(record.id) } : {}),
      execute: async () => {
        const loaded = await loadContext(record.id, GUEST_ACTION_CAPABILITY[action]);
        try {
          const status = await fetchProxmoxGuestPowerStatus(loaded.ctx, node, guestType, vmid);
          switch (action) {
            case "start":
              if (status === "running") {
                deps.refreshFence.advance(record.id);
                return "success";
              }
              break;
            case "shutdown":
              if (status === "stopped") {
                deps.refreshFence.advance(record.id);
                return "success";
              }
              break;
            case "reboot":
              if (status === "stopped")
                throw new IntegrationError("CONFLICT", "Proxmox guest is not running");
              break;
            default: {
              const _exhaustive: never = action;
              throw new IntegrationError("INTERNAL_ERROR", String(_exhaustive));
            }
          }
          await postProxmoxGuestPower(loaded.ctx, node, guestType, vmid, action);
          deps.refreshFence.advance(record.id);
          return "accepted";
        } catch (error) {
          throw normalizedRedactedError(error, loaded.secrets);
        }
      },
    });
  }

  return {
    permissions(actor: ProxmoxActor): ProxmoxPermissionsView {
      return proxmoxPermissionsView(actor);
    },
    async listIntegrations(actor: ProxmoxActor): Promise<readonly ProxmoxIntegrationMetadata[]> {
      assertProxmoxAccess(actor, "read");
      const records = await listProxmoxRecords(deps.store);
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
      actor: ProxmoxActor,
    ): Promise<ProxmoxIntegrationMetadata> {
      assertProxmoxAccess(actor, "read");
      const record = await requireProxmoxRecord(integrationId);
      return Object.freeze({
        id: record.id,
        name: record.name,
        enabled: record.enabled,
      });
    },
    async getOverview(integrationId: string, actor: ProxmoxActor): Promise<ProxmoxOverview> {
      assertProxmoxAccess(actor, "read");
      const record = await requireProxmoxRecord(integrationId);
      return overviewFor(record.id, deps.refreshFence.current(record.id));
    },
    async refreshOverview(integrationId: string, actor: ProxmoxActor): Promise<ProxmoxOverview> {
      assertProxmoxAccess(actor, "read");
      const record = await requireProxmoxRecord(integrationId);
      const recordId = record.id;
      if (!deps.refreshRateLimiter.tryConsume(actor.userId ?? "anonymous", recordId))
        throw new IntegrationError("RATE_LIMITED", "Too many Proxmox refreshes");
      const generation = deps.refreshFence.advance(recordId);
      deps.cache.invalidate(recordId);
      return overviewFor(recordId, generation);
    },
    async startGuest(
      input: ProxmoxGuestActionInput,
      actor: ProxmoxActor,
    ): Promise<SafeActionResult> {
      return runGuestPower("start", input, actor);
    },
    async shutdownGuest(
      input: ProxmoxGuestActionInput,
      actor: ProxmoxActor,
    ): Promise<SafeActionResult> {
      return runGuestPower("shutdown", input, actor);
    },
    async rebootGuest(
      input: ProxmoxGuestActionInput,
      actor: ProxmoxActor,
    ): Promise<SafeActionResult> {
      return runGuestPower("reboot", input, actor);
    },
  };
}

export type ProxmoxService = ReturnType<typeof createProxmoxService>;
