export const AUTOMATION_ERROR_CODES = [
  "VALIDATION_ERROR",
  "CONFLICT",
  "NOT_FOUND",
  "FORBIDDEN",
  "DENIED_OWNER_MISSING",
  "DENIED_OWNER_DISABLED",
  "DENIED_PERMISSION",
] as const;
export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

export class AutomationError extends Error {
  constructor(
    readonly code: AutomationErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AutomationError";
  }
}
