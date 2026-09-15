import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { SeerrSectionReason } from "./types";

export const SEERR_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type SeerrErrorKind = (typeof SEERR_ERROR_KINDS)[number];

export class SeerrError extends Error {
  constructor(
    readonly kind: SeerrErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "SeerrError";
  }
}

const KIND_TO_INTEGRATION: Record<SeerrErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: SeerrError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapSeerrHttpStatus(status: number): SeerrError {
  switch (status) {
    case 401:
      return new SeerrError("UNAUTHORIZED", "Seerr API key is invalid", status);
    case 403:
      return new SeerrError("FORBIDDEN", "Seerr access is forbidden", status);
    case 404:
      return new SeerrError("NOT_FOUND", "Seerr endpoint was not found", status);
    case 429:
      return new SeerrError("RATE_LIMITED", "Seerr rate limit exceeded", status);
    default:
      return new SeerrError("INVALID_RESPONSE", "Seerr request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): SeerrSectionReason {
  if (error instanceof SeerrError) {
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
