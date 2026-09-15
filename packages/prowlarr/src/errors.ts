import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { ProwlarrSectionReason } from "./types";

export const PROWLARR_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type ProwlarrErrorKind = (typeof PROWLARR_ERROR_KINDS)[number];

export class ProwlarrError extends Error {
  constructor(
    readonly kind: ProwlarrErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProwlarrError";
  }
}

const KIND_TO_INTEGRATION: Record<ProwlarrErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: ProwlarrError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapProwlarrHttpStatus(status: number): ProwlarrError {
  switch (status) {
    case 401:
      return new ProwlarrError("UNAUTHORIZED", "Prowlarr API key is invalid", status);
    case 403:
      return new ProwlarrError("FORBIDDEN", "Prowlarr access is forbidden", status);
    case 404:
      return new ProwlarrError("NOT_FOUND", "Prowlarr endpoint was not found", status);
    case 429:
      return new ProwlarrError("RATE_LIMITED", "Prowlarr rate limit exceeded", status);
    default:
      return new ProwlarrError("INVALID_RESPONSE", "Prowlarr request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): ProwlarrSectionReason {
  if (error instanceof ProwlarrError) {
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
