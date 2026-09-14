import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";
import type { ProxmoxSectionReason } from "./types";

export const PROXMOX_ERROR_KINDS = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "RATE_LIMITED",
  "INVALID_RESPONSE",
  "TIMEOUT",
] as const;

export type ProxmoxErrorKind = (typeof PROXMOX_ERROR_KINDS)[number];

export class ProxmoxError extends Error {
  constructor(
    readonly kind: ProxmoxErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProxmoxError";
  }
}

const KIND_TO_INTEGRATION: Record<ProxmoxErrorKind, IntegrationErrorCode> = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  TIMEOUT: "TIMEOUT",
};

export function toIntegrationError(error: ProxmoxError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function mapProxmoxHttpStatus(status: number): ProxmoxError {
  switch (status) {
    case 401:
      return new ProxmoxError("UNAUTHORIZED", "Proxmox API token is invalid", status);
    case 403:
      return new ProxmoxError("FORBIDDEN", "Proxmox access is forbidden", status);
    case 404:
      return new ProxmoxError("NOT_FOUND", "Proxmox endpoint was not found", status);
    case 429:
      return new ProxmoxError("RATE_LIMITED", "Proxmox rate limit exceeded", status);
    default:
      return new ProxmoxError("INVALID_RESPONSE", "Proxmox request failed", status);
  }
}

export function sectionReasonFromError(error: unknown): ProxmoxSectionReason {
  if (error instanceof ProxmoxError) {
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
