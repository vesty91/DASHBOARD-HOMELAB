import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { parseDiscoveredApis, requireOkEnvelope, type DiscoveredApis } from "./api-discovery";
import { login, logout, sessionHeaders, type DsmSession, type LoginInput } from "./auth";
import {
  assertUsefulResources,
  assertUsefulSystemInfo,
  mapDisks,
  mapResources,
  mapSystemInfo,
  mapVolumes,
  parseCoreSystemPayload,
  parseDsmInfoPayload,
  parseStoragePayload,
  parseUtilizationPayload,
  storageLooksDegraded,
} from "./dto";
import { isRetryableSessionError, SynologyError, throwMapped, toIntegrationError } from "./errors";
import { INFO_QUERY, SYNOLOGY_ENTRY_CGI } from "./policy";
import type { SynologyConfig, SynologySecrets } from "./schemas";
import {
  synologyFetch,
  SYNOLOGY_JSON_MAX_BYTES,
  SYNOLOGY_STORAGE_MAX_BYTES,
  type SynologyRequestFn,
  type SynologyTransportContext,
} from "./transport";
import type {
  SynologyOverview,
  SynologyResourcesDto,
  SynologySection,
  SynologySectionReason,
  SynologyStorageDto,
  SynologySystemDto,
} from "./types";

export { SYNOLOGY_JSON_MAX_BYTES, SYNOLOGY_STORAGE_MAX_BYTES };
export type { SynologyRequestFn };

export const OVERVIEW_CACHE_TTL_MS = 15_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;

export interface SynologyClientContext extends SynologyTransportContext {
  readonly account: string;
  readonly password: string;
  readonly deviceId?: string;
  readonly request: SynologyRequestFn;
}

export function synologyContextFromIntegration(
  ctx: IntegrationClientContext<SynologyConfig, SynologySecrets>,
): SynologyClientContext {
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    account: ctx.config.account,
    password: ctx.secrets.password,
    request: ctx.request,
    ...(ctx.config.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.config.trustedCaPem }),
    ...(ctx.secrets.deviceId === undefined ? {} : { deviceId: ctx.secrets.deviceId }),
  };
}

function transportOf(ctx: SynologyClientContext): SynologyTransportContext {
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    ...(ctx.trustedCaPem === undefined ? {} : { trustedCaPem: ctx.trustedCaPem }),
  };
}

export function buildApiInfoRequest(): URLSearchParams {
  return new URLSearchParams({
    api: "SYNO.API.Info",
    version: "1",
    method: "query",
    query: INFO_QUERY,
  });
}

export function buildDsmInfoRequest(version: number): URLSearchParams {
  return new URLSearchParams({
    api: "SYNO.DSM.Info",
    version: String(version),
    method: "getinfo",
  });
}

export function buildSystemRequest(version: number): URLSearchParams {
  return new URLSearchParams({
    api: "SYNO.Core.System",
    version: String(version),
    method: "info",
  });
}

export function buildUtilizationRequest(): URLSearchParams {
  return new URLSearchParams({
    api: "SYNO.Core.System.Utilization",
    version: "1",
    method: "get",
  });
}

export function buildStorageRequest(): URLSearchParams {
  return new URLSearchParams({
    api: "SYNO.Storage.CGI.Storage",
    version: "1",
    method: "load_info",
  });
}

async function discoverApis(ctx: SynologyClientContext): Promise<DiscoveredApis> {
  const result = await synologyFetch(ctx.request, transportOf(ctx), "GET", SYNOLOGY_ENTRY_CGI, {
    search: buildApiInfoRequest(),
  });
  return parseDiscoveredApis(requireOkEnvelope(result, "DSM API discovery failed"));
}

async function dsmGet(
  ctx: SynologyClientContext,
  session: DsmSession,
  search: URLSearchParams,
  maxBodyBytes = SYNOLOGY_JSON_MAX_BYTES,
): Promise<unknown> {
  const result = await synologyFetch(ctx.request, transportOf(ctx), "GET", SYNOLOGY_ENTRY_CGI, {
    search,
    headers: sessionHeaders(session),
    maxBodyBytes,
  });
  return requireOkEnvelope(result, "DSM request failed");
}

function sectionReasonFromError(error: unknown): SynologySectionReason {
  if (error instanceof SynologyError) {
    switch (error.kind) {
      case "PERMISSION_DENIED":
        return "permission-denied";
      case "UNSUPPORTED_VERSION":
        return "unsupported-version";
      case "API_UNAVAILABLE":
        return "api-unavailable";
      case "INVALID_RESPONSE":
        return "invalid-response";
      default:
        return "unknown";
    }
  }
  if (error instanceof IntegrationError) {
    switch (error.code) {
      case "TIMEOUT":
        return "timeout";
      case "FORBIDDEN":
        return "permission-denied";
      case "UNSUPPORTED_VERSION":
        return "unsupported-version";
      case "NOT_FOUND":
        return "api-unavailable";
      case "INVALID_RESPONSE":
        return "invalid-response";
      default:
        return "unknown";
    }
  }
  return "unknown";
}

function unavailable<T>(error: unknown): SynologySection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function loadSystem(
  ctx: SynologyClientContext,
  session: DsmSession,
  discovered: DiscoveredApis,
): Promise<SynologySection<SynologySystemDto>> {
  if (!discovered.dsmInfo.available || discovered.dsmInfo.version === null)
    return {
      status: "unavailable",
      data: null,
      reason: discovered.dsmInfo.reason ?? "api-unavailable",
    };
  try {
    const dsmInfo = parseDsmInfoPayload(
      await dsmGet(ctx, session, buildDsmInfoRequest(discovered.dsmInfo.version)),
    );
    const base = mapSystemInfo(dsmInfo);
    assertUsefulSystemInfo(base);
    if (!discovered.system.available || discovered.system.version === null)
      return { status: "available", data: base };
    try {
      const core = parseCoreSystemPayload(
        await dsmGet(ctx, session, buildSystemRequest(discovered.system.version)),
      );
      return { status: "available", data: mapSystemInfo(dsmInfo, core) };
    } catch (error) {
      if (isRetryableSessionError(error)) throw error;
      return {
        status: "degraded",
        data: base,
        reason: sectionReasonFromError(error),
      };
    }
  } catch (error) {
    if (isRetryableSessionError(error)) throw error;
    return unavailable(error);
  }
}

async function loadResources(
  ctx: SynologyClientContext,
  session: DsmSession,
  discovered: DiscoveredApis,
): Promise<SynologySection<SynologyResourcesDto>> {
  if (!discovered.utilization.available)
    return {
      status: "unavailable",
      data: null,
      reason: discovered.utilization.reason ?? "api-unavailable",
    };
  try {
    const raw = await dsmGet(ctx, session, buildUtilizationRequest());
    const data = mapResources(parseUtilizationPayload(raw));
    assertUsefulResources(data);
    return { status: "available", data };
  } catch (error) {
    if (isRetryableSessionError(error)) throw error;
    return unavailable(error);
  }
}

async function loadStorage(
  ctx: SynologyClientContext,
  session: DsmSession,
  discovered: DiscoveredApis,
): Promise<SynologySection<SynologyStorageDto>> {
  if (!discovered.storage.available)
    return {
      status: "unavailable",
      data: null,
      reason: discovered.storage.reason ?? "api-unavailable",
    };
  try {
    const raw = await dsmGet(ctx, session, buildStorageRequest(), SYNOLOGY_STORAGE_MAX_BYTES);
    const payload = parseStoragePayload(raw);
    const volumes = mapVolumes(payload.volumes);
    const disks = mapDisks(payload.disks);
    return {
      status: storageLooksDegraded(volumes, disks) ? "degraded" : "available",
      data: { volumes, disks },
    };
  } catch (error) {
    if (isRetryableSessionError(error)) throw error;
    return unavailable(error);
  }
}

async function fetchSections(
  ctx: SynologyClientContext,
  session: DsmSession,
  discovered: DiscoveredApis,
): Promise<Omit<SynologyOverview, "fetchedAt" | "status">> {
  const system = await loadSystem(ctx, session, discovered);
  const resources = await loadResources(ctx, session, discovered);
  const storage = await loadStorage(ctx, session, discovered);
  return { system, resources, storage };
}

function loginInput(ctx: SynologyClientContext, authVersion: number, otpCode?: string): LoginInput {
  return {
    account: ctx.account,
    password: ctx.password,
    authVersion,
    ...(ctx.deviceId === undefined ? {} : { deviceId: ctx.deviceId }),
    ...(otpCode === undefined ? {} : { otpCode, enableDeviceToken: true }),
  };
}

async function withSession<T>(
  ctx: SynologyClientContext,
  operation: (session: DsmSession, discovered: DiscoveredApis) => Promise<T>,
): Promise<T> {
  const discovered = await discoverApis(ctx);
  let session = await login(
    ctx.request,
    transportOf(ctx),
    loginInput(ctx, discovered.auth.version),
  );
  try {
    try {
      return await operation(session, discovered);
    } catch (error) {
      if (!isRetryableSessionError(error)) throw error;
      await logout(ctx.request, transportOf(ctx), session);
      session = await login(
        ctx.request,
        transportOf(ctx),
        loginInput(ctx, discovered.auth.version),
      );
      return await operation(session, discovered);
    }
  } catch (error) {
    throwMapped(error);
  } finally {
    await logout(ctx.request, transportOf(ctx), session);
  }
}

export async function fetchSynologyOverview(ctx: SynologyClientContext): Promise<SynologyOverview> {
  const sections = await withSession(ctx, (session, discovered) =>
    fetchSections(ctx, session, discovered),
  );
  const status =
    sections.system.status === "available" &&
    sections.resources.status === "available" &&
    sections.storage.status === "available"
      ? "available"
      : "degraded";
  return {
    status,
    ...sections,
    fetchedAt: new Date().toISOString(),
  };
}

function systemUnavailableError(reason: SynologySectionReason | undefined): IntegrationError {
  switch (reason) {
    case "timeout":
      return new IntegrationError("TIMEOUT", "DSM system information timed out");
    case "permission-denied":
      return new IntegrationError("FORBIDDEN", "DSM system information is forbidden");
    case "unsupported-version":
      return new IntegrationError("UNSUPPORTED_VERSION", "DSM system API version is not supported");
    case "invalid-response":
      return new IntegrationError("INVALID_RESPONSE", "DSM system information is invalid");
    case "api-unavailable":
      return new IntegrationError("NOT_FOUND", "DSM system information is unavailable");
    case "unknown":
    case undefined:
      return new IntegrationError("UNKNOWN", "DSM system information is unavailable");
    default: {
      const _exhaustive: never = reason;
      return new IntegrationError("UNKNOWN", String(_exhaustive));
    }
  }
}

export async function testSynologyConnection(
  ctx: SynologyClientContext,
): Promise<{ model: string | null; dsmVersion: string | null; uptimeSeconds: number | null }> {
  return withSession(ctx, async (session, discovered) => {
    const system = await loadSystem(ctx, session, discovered);
    if (system.status === "unavailable" || !system.data)
      throw systemUnavailableError(system.reason);
    return {
      model: system.data.model,
      dsmVersion: system.data.dsmVersion,
      uptimeSeconds: system.data.uptimeSeconds,
    };
  });
}

export async function enrollTrustedDevice(
  ctx: SynologyClientContext,
  otpCode: string,
): Promise<{ did: string }> {
  try {
    const discovered = await discoverApis(ctx);
    const session = await login(
      ctx.request,
      transportOf(ctx),
      loginInput(ctx, discovered.auth.version, otpCode),
    );
    try {
      if (!session.did)
        throw new SynologyError("INVALID_RESPONSE", "DSM did not return a device id");
      return { did: session.did };
    } finally {
      await logout(ctx.request, transportOf(ctx), session);
    }
  } catch (error) {
    throwMapped(error);
  }
}

export function overviewCacheTtl(overview: SynologyOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

export { toIntegrationError };
