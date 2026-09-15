import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { isQbittorrentLoginOk, mapTorrents, mapTransfer, mapVersion, parseJsonValue } from "./dto";
import { QbittorrentError, sectionReasonFromError, toIntegrationError } from "./errors";
import {
  QBITTORRENT_TORRENTS_PAUSE_PATH,
  QBITTORRENT_TORRENTS_RESUME_PATH,
  QBITTORRENT_TORRENTS_START_PATH,
  QBITTORRENT_TORRENTS_STOP_PATH,
  QBITTORRENT_TORRENTS_PATH,
  QBITTORRENT_TRANSFER_PATH,
  QBITTORRENT_VERSION_PATH,
} from "./policy";
import { qbittorrentHashesFormBody } from "./hashes";
import type { QbittorrentConfig, QbittorrentSecrets } from "./schemas";
import { parseQbittorrentSid } from "./sid";
import {
  QBITTORRENT_JSON_MAX_BYTES,
  QBITTORRENT_LIST_MAX_BYTES,
  QBITTORRENT_TEXT_MAX_BYTES,
  qbittorrentFetch,
  qbittorrentLogin,
  qbittorrentLogout,
  qbittorrentPostForm,
  type QbittorrentRequestFn,
  type QbittorrentTransportContext,
} from "./transport";
import type {
  QbittorrentOverview,
  QbittorrentOverviewStatus,
  QbittorrentSection,
  QbittorrentSectionReason,
  QbittorrentTorrentsDto,
  QbittorrentTransferDto,
  QbittorrentVersionDto,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const QBITTORRENT_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface QbittorrentClientContext extends QbittorrentTransportContext {
  readonly request: QbittorrentRequestFn;
  readonly secretValues: readonly string[];
}

export function qbittorrentContextFromIntegration(
  ctx: IntegrationClientContext<QbittorrentConfig, QbittorrentSecrets> & {
    secretValues?: readonly string[];
  },
): QbittorrentClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    username: ctx.secrets.username,
    password: ctx.secrets.password,
    request: ctx.request,
    secretValues: ctx.secretValues ?? [ctx.secrets.username, ctx.secrets.password],
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}

function sectionFromError<T>(error: unknown): QbittorrentSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function loginSession(ctx: QbittorrentClientContext): Promise<string> {
  const result = await qbittorrentLogin(ctx.request, ctx);
  if (!isQbittorrentLoginOk(result.body))
    throw new QbittorrentError(
      "UNAUTHORIZED",
      "qBittorrent credentials are invalid",
      result.status,
    );
  return parseQbittorrentSid(result.setCookie);
}

async function withSession<T>(
  ctx: QbittorrentClientContext,
  run: (sid: string) => Promise<T>,
): Promise<T> {
  const sid = await loginSession(ctx);
  try {
    return await run(sid);
  } finally {
    await qbittorrentLogout(ctx.request, ctx, sid);
  }
}

export async function testQbittorrentConnection(
  ctx: QbittorrentClientContext,
): Promise<QbittorrentVersionDto> {
  return withSession(ctx, async (sid) => {
    const result = await qbittorrentFetch(ctx.request, ctx, "GET", QBITTORRENT_VERSION_PATH, sid, {
      maxBodyBytes: QBITTORRENT_TEXT_MAX_BYTES,
      accept: "text/plain",
    });
    return mapVersion(result.body.toString("utf8"), ctx.secretValues);
  });
}

async function loadVersion(
  ctx: QbittorrentClientContext,
  sid: string,
): Promise<QbittorrentSection<QbittorrentVersionDto>> {
  try {
    const result = await qbittorrentFetch(ctx.request, ctx, "GET", QBITTORRENT_VERSION_PATH, sid, {
      maxBodyBytes: QBITTORRENT_TEXT_MAX_BYTES,
      accept: "text/plain",
    });
    return {
      status: "available",
      data: mapVersion(result.body.toString("utf8"), ctx.secretValues),
    };
  } catch (error) {
    if (error instanceof QbittorrentError || error instanceof IntegrationError)
      return sectionFromError<QbittorrentVersionDto>(error);
    throw error;
  }
}

async function loadTransfer(
  ctx: QbittorrentClientContext,
  sid: string,
): Promise<QbittorrentSection<QbittorrentTransferDto>> {
  try {
    const result = await qbittorrentFetch(ctx.request, ctx, "GET", QBITTORRENT_TRANSFER_PATH, sid, {
      maxBodyBytes: QBITTORRENT_JSON_MAX_BYTES,
    });
    return { status: "available", data: mapTransfer(parseJsonValue(result.body)) };
  } catch (error) {
    if (error instanceof QbittorrentError || error instanceof IntegrationError)
      return sectionFromError<QbittorrentTransferDto>(error);
    throw error;
  }
}

async function loadTorrents(
  ctx: QbittorrentClientContext,
  sid: string,
): Promise<QbittorrentSection<QbittorrentTorrentsDto>> {
  try {
    const result = await qbittorrentFetch(ctx.request, ctx, "GET", QBITTORRENT_TORRENTS_PATH, sid, {
      maxBodyBytes: QBITTORRENT_LIST_MAX_BYTES,
    });
    return { status: "available", data: mapTorrents(parseJsonValue(result.body)) };
  } catch (error) {
    if (error instanceof QbittorrentError || error instanceof IntegrationError)
      return sectionFromError<QbittorrentTorrentsDto>(error);
    throw error;
  }
}

export function overviewCacheTtl(overview: QbittorrentOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: QbittorrentSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(
        new QbittorrentError("UNAUTHORIZED", "qBittorrent credentials are invalid"),
      );
    case "timeout":
      throw new IntegrationError("TIMEOUT", "qBittorrent request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "qBittorrent rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "qBittorrent request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "qBittorrent request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "qBittorrent request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "qBittorrent access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "qBittorrent endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "qBittorrent overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function postQbittorrentTorrentAction(
  ctx: QbittorrentClientContext,
  action: "pause" | "resume",
  hashes: readonly string[],
): Promise<void> {
  const primary =
    action === "pause" ? QBITTORRENT_TORRENTS_STOP_PATH : QBITTORRENT_TORRENTS_START_PATH;
  const fallback =
    action === "pause" ? QBITTORRENT_TORRENTS_PAUSE_PATH : QBITTORRENT_TORRENTS_RESUME_PATH;
  const body = qbittorrentHashesFormBody(hashes);
  await withSession(ctx, async (sid) => {
    try {
      await qbittorrentPostForm(ctx.request, ctx, primary, sid, body);
    } catch (error) {
      const notFound =
        (error instanceof QbittorrentError && error.kind === "NOT_FOUND") ||
        (error instanceof IntegrationError && error.code === "NOT_FOUND");
      if (!notFound) throw error;
      await qbittorrentPostForm(ctx.request, ctx, fallback, sid, body);
    }
  });
}

export async function fetchQbittorrentOverview(
  ctx: QbittorrentClientContext,
): Promise<QbittorrentOverview> {
  return withSession(ctx, async (sid) => {
    const [version, transfer, torrents] = await Promise.all([
      loadVersion(ctx, sid),
      loadTransfer(ctx, sid),
      loadTorrents(ctx, sid),
    ]);
    const sections = [version, transfer, torrents];
    const available = sections.filter((section) => section.status === "available").length;
    if (available === 0) {
      throwFromSectionReason(version.reason ?? transfer.reason ?? torrents.reason ?? "unknown");
    }
    const status: QbittorrentOverviewStatus =
      available === sections.length ? "available" : "degraded";
    return {
      status,
      fetchedAt: new Date().toISOString(),
      version,
      transfer,
      torrents,
    };
  });
}
