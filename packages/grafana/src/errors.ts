import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { GrafanaSectionReason } from "./types";

export const GRAFANA_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type GrafanaErrorKind = (typeof GRAFANA_ERROR_KINDS)[number];

export class GrafanaError extends Error {
  constructor(
    readonly kind: GrafanaErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GrafanaError";
  }
}

const KIND_TO_INTEGRATION: Record<GrafanaErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: GrafanaError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapGrafanaHttpStatus(status: number): GrafanaError {
  switch (status) {
    case 401:
      return new GrafanaError("UNAUTHORIZED", "Grafana service account token is invalid", status);
    case 403:
      return new GrafanaError("FORBIDDEN", "Grafana access is forbidden", status);
    case 404:
      return new GrafanaError("NOT_FOUND", "Grafana endpoint was not found", status);
    case 429:
      return new GrafanaError("RATE_LIMITED", "Grafana rate limit exceeded", status);
    default:
      return new GrafanaError("INVALID_RESPONSE", "Grafana request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): GrafanaSectionReason {
  if (error instanceof GrafanaError) {
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
