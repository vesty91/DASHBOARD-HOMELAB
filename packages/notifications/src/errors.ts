export const NOTIFICATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "DENIED_PERMISSION",
  "NOT_FOUND",
  "CONFLICT",
  "SECRETS_NOT_CONFIGURED",
  "MISCONFIGURED",
] as const;
export type NotificationErrorCode = (typeof NOTIFICATION_ERROR_CODES)[number];

export class NotificationError extends Error {
  readonly code: NotificationErrorCode;
  constructor(code: NotificationErrorCode, message: string) {
    super(message);
    this.name = "NotificationError";
    this.code = code;
  }
}
