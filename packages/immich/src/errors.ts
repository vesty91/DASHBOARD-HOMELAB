import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { ImmichSectionReason } from "./types";

export const IMMICH_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type ImmichErrorKind = (typeof IMMICH_ERROR_KINDS)[number];

export class ImmichError extends Error {
  constructor(
    readonly kind: ImmichErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ImmichError";
  }
}

const KIND_TO_INTEGRATION: Record<ImmichErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: ImmichError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapImmichHttpStatus(status: number): ImmichError {
  switch (status) {
    case 401:
      return new ImmichError("UNAUTHORIZED", "Immich API key is invalid", status);
    case 403:
      return new ImmichError("FORBIDDEN", "Immich access is forbidden", status);
    case 404:
      return new ImmichError("NOT_FOUND", "Immich endpoint was not found", status);
    case 429:
      return new ImmichError("RATE_LIMITED", "Immich rate limit exceeded", status);
    default:
      return new ImmichError("INVALID_RESPONSE", "Immich request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): ImmichSectionReason {
  if (error instanceof ImmichError) {
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
