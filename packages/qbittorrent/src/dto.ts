import { IntegrationError, redactKnownSecretValues } from "@dashboard/integrations";
import type {
  QbittorrentConnectionStatus,
  QbittorrentTorrentBucket,
  QbittorrentTorrentsDto,
  QbittorrentTransferDto,
  QbittorrentVersionDto,
} from "./types";

export const QBITTORRENT_TORRENTS_MAX = 2_000;
export const QBITTORRENT_VERSION_MAX = 64;

function invalid(message: string): never {
  throw new IntegrationError("INVALID_RESPONSE", message);
}

export function parseJsonValue(body: Buffer | string): unknown {
  try {
    return JSON.parse(typeof body === "string" ? body : body.toString("utf8")) as unknown;
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "qBittorrent returned invalid JSON");
  }
}

function boundText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001F\u007F]/u.test(trimmed)) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function redactText(value: string | null, secretValues: readonly string[]): string | null {
  if (value === null) return null;
  const redacted = redactKnownSecretValues(value, secretValues);
  return typeof redacted === "string" ? redacted : null;
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(message);
  return value as Record<string, unknown>;
}

function nonNegativeFinite(value: unknown, message: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(message);
  return value;
}

function connectionStatus(value: unknown): QbittorrentConnectionStatus | undefined {
  if (value === "connected" || value === "firewalled" || value === "disconnected") return value;
  return undefined;
}

export function isQbittorrentLoginOk(body: Buffer | string): boolean {
  const text = (typeof body === "string" ? body : body.toString("utf8")).trim();
  return text === "Ok.";
}

export function mapVersion(
  value: unknown,
  secretValues: readonly string[] = [],
): QbittorrentVersionDto {
  const version = redactText(boundText(value, QBITTORRENT_VERSION_MAX), secretValues);
  return { version };
}

export function mapTransfer(value: unknown): QbittorrentTransferDto {
  const record = asRecord(value, "qBittorrent transfer payload is invalid");
  const downloadSpeedBps = nonNegativeFinite(
    record.dl_info_speed,
    "qBittorrent download speed is invalid",
  );
  const uploadSpeedBps = nonNegativeFinite(
    record.up_info_speed,
    "qBittorrent upload speed is invalid",
  );
  const connection = connectionStatus(record.connection_status);
  return {
    downloadSpeedBps,
    uploadSpeedBps,
    ...(connection === undefined ? {} : { connectionStatus: connection }),
  };
}

export function classifyTorrentState(value: unknown): QbittorrentTorrentBucket {
  const normalized = boundText(value, 64)?.toLocaleLowerCase("und");
  switch (normalized) {
    case "downloading":
    case "metadl":
    case "forceddl":
    case "forcedmetadl":
      return "downloading";
    case "uploading":
    case "forcedup":
      return "uploading";
    case "stalleddl":
    case "stalledup":
      return "stalled";
    case "queueddl":
    case "queuedup":
      return "queued";
    case "pauseddl":
    case "pausedup":
    case "stoppeddl":
    case "stoppedup":
      return "paused";
    default:
      return "other";
  }
}

export function mapTorrents(value: unknown): QbittorrentTorrentsDto {
  if (!Array.isArray(value)) invalid("qBittorrent torrents payload is invalid");
  if (value.length > QBITTORRENT_TORRENTS_MAX) invalid("qBittorrent torrents payload is oversized");
  const counts: Record<QbittorrentTorrentBucket, number> = {
    downloading: 0,
    uploading: 0,
    stalled: 0,
    queued: 0,
    paused: 0,
    other: 0,
  };
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      invalid("qBittorrent torrents payload is invalid");
    const bucket = classifyTorrentState((entry as Record<string, unknown>).state);
    counts[bucket] += 1;
  }
  return counts;
}
