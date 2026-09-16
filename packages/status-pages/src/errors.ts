export const STATUS_PAGE_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "DENIED_PERMISSION",
  "NOT_FOUND",
  "VALIDATION_ERROR",
  "CONFLICT",
  "TOO_MANY_REQUESTS",
] as const;
export type StatusPageErrorCode = (typeof STATUS_PAGE_ERROR_CODES)[number];

export class StatusPageError extends Error {
  readonly code: StatusPageErrorCode;
  constructor(code: StatusPageErrorCode, message: string) {
    super(message);
    this.name = "StatusPageError";
    this.code = code;
  }
}
