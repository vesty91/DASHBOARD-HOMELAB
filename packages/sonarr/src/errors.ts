import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { SonarrSectionReason } from "./types";

export const SONARR_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type SonarrErrorKind = (typeof SONARR_ERROR_KINDS)[number];

export class SonarrError extends Error {
  constructor(
    readonly kind: SonarrErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SonarrError";
  }
}

const KIND_TO_INTEGRATION: Record<SonarrErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: SonarrError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapSonarrHttpStatus(status: number): SonarrError {
  switch (status) {
    case 401:
      return new SonarrError("UNAUTHORIZED", "Sonarr API key is invalid", status);
    case 403:
      return new SonarrError("FORBIDDEN", "Sonarr access is forbidden", status);
    case 404:
      return new SonarrError("NOT_FOUND", "Sonarr endpoint was not found", status);
    case 429:
      return new SonarrError("RATE_LIMITED", "Sonarr rate limit exceeded", status);
    default:
      return new SonarrError("INVALID_RESPONSE", "Sonarr request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): SonarrSectionReason {
  if (error instanceof SonarrError) {
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
