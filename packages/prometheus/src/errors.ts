import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";

export const PROMETHEUS_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type PrometheusErrorKind = (typeof PROMETHEUS_ERROR_KINDS)[number];

export class PrometheusError extends Error {
  constructor(
    readonly kind: PrometheusErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PrometheusError";
  }
}

const KIND_TO_INTEGRATION: Record<PrometheusErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: PrometheusError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapPrometheusHttpStatus(status: number): PrometheusError {
  switch (status) {
    case 401:
      return new PrometheusError("UNAUTHORIZED", "Prometheus credentials are invalid", status);
    case 403:
      return new PrometheusError("FORBIDDEN", "Prometheus access is forbidden", status);
    case 404:
      return new PrometheusError("NOT_FOUND", "Prometheus endpoint was not found", status);
    case 429:
      return new PrometheusError("RATE_LIMITED", "Prometheus rate limit exceeded", status);
    default:
      return new PrometheusError("INVALID_RESPONSE", "Prometheus request failed", status);
  }
}
