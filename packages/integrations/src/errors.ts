export const INTEGRATION_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "TIMEOUT",
  "DNS_ERROR",
  "TLS_ERROR",
  "UNREACHABLE",
  "INVALID_RESPONSE",
  "RATE_LIMITED",
  "UNSUPPORTED_VERSION",
  "MISCONFIGURED",
  "NOT_FOUND",
  "UNKNOWN",
  "TARGET_BLOCKED",
  "SECRETS_NOT_CONFIGURED",
  "STALE_RESULT",
  "VALIDATION_ERROR",
  "CONFLICT",
  "INTERNAL_ERROR",
] as const;

export type IntegrationErrorCode = (typeof INTEGRATION_ERROR_CODES)[number];

export class IntegrationError extends Error {
  constructor(
    readonly code: IntegrationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationError";
  }
}

export function classifyHttpStatus(status: number): IntegrationErrorCode | null {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 200 && status < 300) return null;
  return "INVALID_RESPONSE";
}
