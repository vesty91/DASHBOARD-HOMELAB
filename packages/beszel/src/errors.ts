import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { BeszelSectionReason } from "./types";

export const BESZEL_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type BeszelErrorKind = (typeof BESZEL_ERROR_KINDS)[number];

export class BeszelError extends Error {
  constructor(
    readonly kind: BeszelErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BeszelError";
  }
}

const KIND_TO_INTEGRATION: Record<BeszelErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: BeszelError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapBeszelHttpStatus(status: number): BeszelError {
  switch (status) {
    case 401:
      return new BeszelError("UNAUTHORIZED", "Beszel credentials are invalid", status);
    case 403:
      return new BeszelError("FORBIDDEN", "Beszel access is forbidden", status);
    case 404:
      return new BeszelError("NOT_FOUND", "Beszel endpoint was not found", status);
    case 429:
      return new BeszelError("RATE_LIMITED", "Beszel rate limit exceeded", status);
    default:
      return new BeszelError("INVALID_RESPONSE", "Beszel request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): BeszelSectionReason {
  if (error instanceof BeszelError) {
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
