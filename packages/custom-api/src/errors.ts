import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { CustomApiSectionReason } from "./types";

export const CUSTOM_API_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type CustomApiErrorKind = (typeof CUSTOM_API_ERROR_KINDS)[number];

export class CustomApiError extends Error {
  constructor(
    readonly kind: CustomApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "CustomApiError";
  }
}

const KIND_TO_INTEGRATION: Record<CustomApiErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: CustomApiError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapCustomApiHttpStatus(status: number): CustomApiError {
  switch (status) {
    case 401:
      return new CustomApiError("UNAUTHORIZED", "Custom API credentials are invalid", status);
    case 403:
      return new CustomApiError("FORBIDDEN", "Custom API access is forbidden", status);
    case 404:
      return new CustomApiError("NOT_FOUND", "Custom API endpoint was not found", status);
    case 429:
      return new CustomApiError("RATE_LIMITED", "Custom API rate limit exceeded", status);
    default:
      return new CustomApiError("INVALID_RESPONSE", "Custom API request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): CustomApiSectionReason {
  if (error instanceof CustomApiError) {
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
