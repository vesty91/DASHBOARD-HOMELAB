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
