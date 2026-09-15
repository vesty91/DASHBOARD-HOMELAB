import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import {
  mapClusterResources,
  mapClusterStatus,
  mapGuestPowerStatus,
  mapVersion,
  parseJsonValue,
} from "./dto";
import { proxmoxGuestPowerPath, proxmoxGuestStatusCurrentPath } from "./guest-path";
import { ProxmoxError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  PROXMOX_CLUSTER_RESOURCES_PATH,
  PROXMOX_CLUSTER_STATUS_PATH,
  PROXMOX_VERSION_PATH,
} from "./policy";
import type { ProxmoxConfig, ProxmoxSecrets } from "./schemas";
import {
  PROXMOX_JSON_MAX_BYTES,
  PROXMOX_RESOURCES_MAX_BYTES,
  proxmoxFetch,
  type ProxmoxRequestFn,
  type ProxmoxTransportContext,
} from "./transport";
import type {
  ProxmoxClusterDto,
  ProxmoxGuestPowerAction,
  ProxmoxGuestPowerStatus,
  ProxmoxGuestType,
  ProxmoxGuestsDto,
  ProxmoxNodesDto,
  ProxmoxOverview,
  ProxmoxOverviewStatus,
  ProxmoxSection,
  ProxmoxSectionReason,
  ProxmoxStorageDto,
  ProxmoxVersionDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const PROXMOX_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface ProxmoxClientContext extends ProxmoxTransportContext {
  readonly request: ProxmoxRequestFn;
  readonly secretValues: readonly string[];
}

export function proxmoxContextFromIntegration(
  ctx: IntegrationClientContext<ProxmoxConfig, ProxmoxSecrets> & {
    secretValues?: readonly string[];
  },
): ProxmoxClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    apiToken: ctx.secrets.apiToken,
    request: ctx.request,
    secretValues: ctx.secretValues ?? [ctx.secrets.apiToken],
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}

function sectionFromError<T>(error: unknown): ProxmoxSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(
  request: ProxmoxRequestFn,
  ctx: ProxmoxTransportContext,
  pathname: string,
  options?: { maxBodyBytes?: number },
): Promise<unknown> {
  const result = await proxmoxFetch(request, ctx, "GET", pathname, options);
  return parseJsonValue(result.body);
}

export async function fetchProxmoxGuestPowerStatus(
  ctx: ProxmoxClientContext,
  node: string,
  guestType: ProxmoxGuestType,
  vmid: number,
): Promise<ProxmoxGuestPowerStatus> {
  const payload = await readJson(
    ctx.request,
    ctx,
    proxmoxGuestStatusCurrentPath(node, guestType, vmid),
    { maxBodyBytes: PROXMOX_JSON_MAX_BYTES },
  );
  return mapGuestPowerStatus(payload);
}

export async function postProxmoxGuestPower(
  ctx: ProxmoxClientContext,
  node: string,
  guestType: ProxmoxGuestType,
  vmid: number,
  action: ProxmoxGuestPowerAction,
): Promise<void> {
  await proxmoxFetch(
    ctx.request,
    ctx,
    "POST",
    proxmoxGuestPowerPath(node, guestType, vmid, action),
  );
}

export async function testProxmoxConnection(
  ctx: ProxmoxClientContext,
): Promise<{ version: string | null; release: string | null }> {
  const payload = await readJson(ctx.request, ctx, PROXMOX_VERSION_PATH, {
    maxBodyBytes: PROXMOX_JSON_MAX_BYTES,
  });
  const version = mapVersion(payload, ctx.secretValues);
  return { version: version.version, release: version.release };
}

async function loadVersion(ctx: ProxmoxClientContext): Promise<ProxmoxSection<ProxmoxVersionDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, PROXMOX_VERSION_PATH, {
      maxBodyBytes: PROXMOX_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapVersion(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof ProxmoxError || error instanceof IntegrationError)
      return sectionFromError<ProxmoxVersionDto>(error);
    throw error;
  }
}

async function loadCluster(ctx: ProxmoxClientContext): Promise<ProxmoxSection<ProxmoxClusterDto>> {
  try {
    const payload = await readJson(ctx.request, ctx, PROXMOX_CLUSTER_STATUS_PATH, {
      maxBodyBytes: PROXMOX_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapClusterStatus(payload, ctx.secretValues) };
  } catch (error) {
    if (error instanceof ProxmoxError || error instanceof IntegrationError)
      return sectionFromError<ProxmoxClusterDto>(error);
    throw error;
  }
}

async function loadResources(ctx: ProxmoxClientContext): Promise<{
  nodes: ProxmoxSection<ProxmoxNodesDto>;
  guests: ProxmoxSection<ProxmoxGuestsDto>;
  storage: ProxmoxSection<ProxmoxStorageDto>;
}> {
  try {
    const payload = await readJson(ctx.request, ctx, PROXMOX_CLUSTER_RESOURCES_PATH, {
      maxBodyBytes: PROXMOX_RESOURCES_MAX_BYTES,
    });
    const mapped = mapClusterResources(payload, ctx.secretValues);
    return {
      nodes: { status: "available", data: mapped.nodes },
      guests: { status: "available", data: mapped.guests },
      storage: { status: "available", data: mapped.storage },
    };
  } catch (error) {
    if (error instanceof ProxmoxError || error instanceof IntegrationError) {
      return {
        nodes: sectionFromError<ProxmoxNodesDto>(error),
        guests: sectionFromError<ProxmoxGuestsDto>(error),
        storage: sectionFromError<ProxmoxStorageDto>(error),
      };
    }
    throw error;
  }
}

export function overviewCacheTtl(overview: ProxmoxOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: ProxmoxSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(new ProxmoxError("UNAUTHORIZED", "Proxmox API token is invalid"));
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Proxmox request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Proxmox rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Proxmox request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Proxmox request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Proxmox request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Proxmox access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Proxmox endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Proxmox overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchProxmoxOverview(ctx: ProxmoxClientContext): Promise<ProxmoxOverview> {
  const [version, cluster, resources] = await Promise.all([
    loadVersion(ctx),
    loadCluster(ctx),
    loadResources(ctx),
  ]);
  const sections = [version, cluster, resources.nodes, resources.guests, resources.storage];
  const available = sections.filter((section) => section.status === "available").length;
  if (available === 0) {
    throwFromSectionReason(version.reason ?? cluster.reason ?? resources.nodes.reason ?? "unknown");
  }
  const status: ProxmoxOverviewStatus = available === sections.length ? "available" : "degraded";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    version,
    cluster,
    nodes: resources.nodes,
    guests: resources.guests,
    storage: resources.storage,
  };
}
