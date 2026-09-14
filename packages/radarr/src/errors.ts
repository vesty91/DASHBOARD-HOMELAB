import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { RadarrSectionReason } from "./types";

export const RADARR_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type RadarrErrorKind = (typeof RADARR_ERROR_KINDS)[number];

export class RadarrError extends Error {
  constructor(
    readonly kind: RadarrErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RadarrError";
  }
}

const KIND_TO_INTEGRATION: Record<RadarrErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: RadarrError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapRadarrHttpStatus(status: number): RadarrError {
  switch (status) {
    case 401:
      return new RadarrError("UNAUTHORIZED", "Radarr API key is invalid", status);
    case 403:
      return new RadarrError("FORBIDDEN", "Radarr access is forbidden", status);
    case 404:
      return new RadarrError("NOT_FOUND", "Radarr endpoint was not found", status);
    case 429:
      return new RadarrError("RATE_LIMITED", "Radarr rate limit exceeded", status);
    default:
      return new RadarrError("INVALID_RESPONSE", "Radarr request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): RadarrSectionReason {
  if (error instanceof RadarrError) {
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
