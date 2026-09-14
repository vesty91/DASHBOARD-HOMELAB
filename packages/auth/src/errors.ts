export const AUTH_ERROR_CODES = [
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_DISABLED",
  "AUTH_SESSION_INVALID",
  "AUTH_SESSION_EXPIRED",
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "ONBOARDING_ALREADY_COMPLETED",
  "LAST_SYSTEM_ADMIN",
  "PASSWORD_POLICY_FAILED",
  "OIDC_DISABLED",
  "OIDC_MISCONFIGURED",
  "OIDC_INVALID_ISSUER",
  "OIDC_INVALID_AUDIENCE",
  "OIDC_TOKEN_EXPIRED",
  "OIDC_INVALID_NONCE",
  "OIDC_INVALID_STATE",
  "OIDC_REDIRECT_FORBIDDEN",
  "OIDC_ACCOUNT_UNLINKED",
  "OIDC_EMAIL_COLLISION",
  "OIDC_UNVERIFIED_EMAIL",
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];
export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message = "Authentication failed",
  ) {
    super(message);
  }
}
