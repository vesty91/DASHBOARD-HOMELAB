import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { UptimeKumaSectionReason } from "./types";

export const UPTIME_KUMA_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type UptimeKumaErrorKind = (typeof UPTIME_KUMA_ERROR_KINDS)[number];

export class UptimeKumaError extends Error {
  constructor(
    readonly kind: UptimeKumaErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UptimeKumaError";
  }
}

const KIND_TO_INTEGRATION: Record<UptimeKumaErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: UptimeKumaError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapUptimeKumaHttpStatus(status: number): UptimeKumaError {
  switch (status) {
    case 401:
      return new UptimeKumaError("UNAUTHORIZED", "Uptime Kuma credentials are invalid", status);
    case 403:
      return new UptimeKumaError("FORBIDDEN", "Uptime Kuma access is forbidden", status);
    case 404:
      return new UptimeKumaError("NOT_FOUND", "Uptime Kuma endpoint was not found", status);
    case 429:
      return new UptimeKumaError("RATE_LIMITED", "Uptime Kuma rate limit exceeded", status);
    default:
      return new UptimeKumaError("INVALID_RESPONSE", "Uptime Kuma request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): UptimeKumaSectionReason {
  if (error instanceof UptimeKumaError) {
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
