import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { NtfySectionReason } from "./types";

export const NTFY_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type NtfyErrorKind = (typeof NTFY_ERROR_KINDS)[number];

export class NtfyError extends Error {
  constructor(
    readonly kind: NtfyErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NtfyError";
  }
}

const KIND_TO_INTEGRATION: Record<NtfyErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: NtfyError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapNtfyHttpStatus(status: number): NtfyError {
  switch (status) {
    case 401:
      return new NtfyError("UNAUTHORIZED", "ntfy access token is invalid", status);
    case 403:
      return new NtfyError("FORBIDDEN", "ntfy access is forbidden", status);
    case 404:
      return new NtfyError("NOT_FOUND", "ntfy endpoint was not found", status);
    case 429:
      return new NtfyError("RATE_LIMITED", "ntfy rate limit exceeded", status);
    default:
      return new NtfyError("INVALID_RESPONSE", "ntfy request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): NtfySectionReason {
  if (error instanceof NtfyError) {
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
