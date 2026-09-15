import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { QbittorrentSectionReason } from "./types";

export const QBITTORRENT_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type QbittorrentErrorKind = (typeof QBITTORRENT_ERROR_KINDS)[number];

export class QbittorrentError extends Error {
  constructor(
    readonly kind: QbittorrentErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QbittorrentError";
  }
}

const KIND_TO_INTEGRATION: Record<QbittorrentErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: QbittorrentError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapQbittorrentHttpStatus(status: number): QbittorrentError {
  switch (status) {
    case 401:
      return new QbittorrentError("UNAUTHORIZED", "qBittorrent credentials are invalid", status);
    case 403:
      return new QbittorrentError("UNAUTHORIZED", "qBittorrent credentials are invalid", status);
    case 404:
      return new QbittorrentError("NOT_FOUND", "qBittorrent endpoint was not found", status);
    case 429:
      return new QbittorrentError("RATE_LIMITED", "qBittorrent rate limit exceeded", status);
    default:
      return new QbittorrentError("INVALID_RESPONSE", "qBittorrent request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): QbittorrentSectionReason {
  if (error instanceof QbittorrentError) {
    switch (error.kind) {
      case "UNAUTHORIZED":
        return "unauthorized";
      case "FORBIDDEN":
        return "permission-denied";
      case "NOT_FOUND":
        return "api-unavailable";
      case "RATE_LIMITED":
        return "rate-limited";
      case "TIMEOUT":
        return "timeout";
      case "INVALID_RESPONSE":
        return "invalid-response";
      default: {
        const _exhaustive: never = error.kind;
        return _exhaustive;
      }
    }
  }
  if (error instanceof IntegrationError) {
    switch (error.code) {
      case "UNAUTHORIZED":
        return "unauthorized";
      case "FORBIDDEN":
        return "permission-denied";
      case "NOT_FOUND":
        return "api-unavailable";
      case "RATE_LIMITED":
        return "rate-limited";
      case "TIMEOUT":
        return "timeout";
      case "INVALID_RESPONSE":
        return "invalid-response";
      case "DNS_ERROR":
        return "dns";
      case "TLS_ERROR":
        return "tls";
      case "UNREACHABLE":
        return "unreachable";
      default:
        return "unknown";
    }
  }
  return "unknown";
}
