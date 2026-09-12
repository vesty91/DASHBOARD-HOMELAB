import { IntegrationError, type IntegrationErrorCode } from "@dashboard/integrations";

export const SYNOLOGY_ERROR_KINDS = [
  "AUTH_INVALID",
  "AUTH_DISABLED",
  "TWO_FACTOR_REQUIRED",
  "OTP_INVALID",
  "ACCOUNT_BLOCKED",
  "PASSWORD_EXPIRED",
  "PERMISSION_DENIED",
  "API_UNAVAILABLE",
  "SESSION_EXPIRED",
  "INVALID_RESPONSE",
  "UNSUPPORTED_VERSION",
] as const;

export type SynologyErrorKind = (typeof SYNOLOGY_ERROR_KINDS)[number];

export class SynologyError extends Error {
  constructor(
    readonly kind: SynologyErrorKind,
    message: string,
    readonly dsmCode?: number,
  ) {
    super(message);
    this.name = "SynologyError";
  }
}

const KIND_TO_INTEGRATION: Record<SynologyErrorKind, IntegrationErrorCode> = {
  AUTH_INVALID: "UNAUTHORIZED",
  AUTH_DISABLED: "FORBIDDEN",
  TWO_FACTOR_REQUIRED: "MISCONFIGURED",
  OTP_INVALID: "UNAUTHORIZED",
  ACCOUNT_BLOCKED: "FORBIDDEN",
  PASSWORD_EXPIRED: "MISCONFIGURED",
  PERMISSION_DENIED: "FORBIDDEN",
  API_UNAVAILABLE: "NOT_FOUND",
  SESSION_EXPIRED: "UNAUTHORIZED",
  INVALID_RESPONSE: "INVALID_RESPONSE",
  UNSUPPORTED_VERSION: "UNSUPPORTED_VERSION",
};

export function toIntegrationError(error: SynologyError): IntegrationError {
  return new IntegrationError(KIND_TO_INTEGRATION[error.kind], error.message);
}

export function isRetryableSessionError(error: unknown): boolean {
  return error instanceof SynologyError && error.kind === "SESSION_EXPIRED";
}

export function mapDsmErrorCode(code: number | undefined): SynologyError {
  if (code === undefined)
    return new SynologyError("INVALID_RESPONSE", "DSM returned an unsuccessful response");
  switch (code) {
    case 100:
      return new SynologyError("INVALID_RESPONSE", "DSM request failed", code);
    case 101:
      return new SynologyError("INVALID_RESPONSE", "DSM API request is missing a parameter", code);
    case 102:
      return new SynologyError("API_UNAVAILABLE", "DSM API does not exist", code);
    case 103:
      return new SynologyError("API_UNAVAILABLE", "DSM API method does not exist", code);
    case 104:
      return new SynologyError("UNSUPPORTED_VERSION", "DSM API version is not supported", code);
    case 105:
      return new SynologyError(
        "PERMISSION_DENIED",
        "Le compte DSM n'a pas le privilège de lire ces informations.",
        code,
      );
    case 106:
    case 107:
    case 119:
      return new SynologyError("SESSION_EXPIRED", "DSM session is invalid", code);
    case 150:
      return new SynologyError("ACCOUNT_BLOCKED", "DSM source IP mismatch", code);
    case 400:
      return new SynologyError("AUTH_INVALID", "Identifiants DSM invalides", code);
    case 401:
      return new SynologyError("AUTH_DISABLED", "Le compte DSM est désactivé", code);
    case 402:
      return new SynologyError("PERMISSION_DENIED", "Accès DSM refusé", code);
    case 403:
    case 406:
      return new SynologyError(
        "TWO_FACTOR_REQUIRED",
        "DSM exige l'authentification à deux facteurs. Enregistrez ce dashboard comme appareil de confiance.",
        code,
      );
    case 404:
      return new SynologyError("OTP_INVALID", "Code OTP DSM invalide", code);
    case 407:
      return new SynologyError("ACCOUNT_BLOCKED", "L'adresse IP source est bloquée par DSM", code);
    case 408:
    case 409:
    case 410:
      return new SynologyError(
        "PASSWORD_EXPIRED",
        "Le mot de passe DSM a expiré ou doit être changé",
        code,
      );
    default:
      return new SynologyError("INVALID_RESPONSE", "DSM request failed", code);
  }
}

export function throwMapped(error: unknown): never {
  if (error instanceof SynologyError) throw toIntegrationError(error);
  throw error;
}
