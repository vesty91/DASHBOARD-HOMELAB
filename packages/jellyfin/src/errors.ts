import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { JellyfinSectionReason } from "./types";

export const JELLYFIN_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type JellyfinErrorKind = (typeof JELLYFIN_ERROR_KINDS)[number];

export class JellyfinError extends Error {
  constructor(
    readonly kind: JellyfinErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JellyfinError";
  }
}

const KIND_TO_INTEGRATION: Record<JellyfinErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: JellyfinError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapJellyfinHttpStatus(status: number): JellyfinError {
  switch (status) {
    case 401:
      return new JellyfinError("UNAUTHORIZED", "Jellyfin API key is invalid", status);
    case 403:
      return new JellyfinError("FORBIDDEN", "Jellyfin access is forbidden", status);
    case 404:
      return new JellyfinError("NOT_FOUND", "Jellyfin endpoint was not found", status);
    case 429:
      return new JellyfinError("RATE_LIMITED", "Jellyfin rate limit exceeded", status);
    default:
      return new JellyfinError("INVALID_RESPONSE", "Jellyfin request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): JellyfinSectionReason {
  if (error instanceof JellyfinError) {
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
      default:
        return "unknown";
    }
  }
  return "unknown";
}
