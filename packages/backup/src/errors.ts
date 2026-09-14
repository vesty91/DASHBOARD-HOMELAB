export const BACKUP_ERROR_CODES = [
  "UNAUTHORIZED",
  "FORBIDDEN",
  "VALIDATION_ERROR",
  "INCOMPATIBLE_SCHEMA",
  "HASH_MISMATCH",
  "TOO_LARGE",
  "CONFIRM_REQUIRED",
  "RESTORE_FAILED",
] as const;

export type BackupErrorCode = (typeof BACKUP_ERROR_CODES)[number];

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BackupError";
  }
}

export function isBackupError(error: unknown): error is BackupError {
  return error instanceof BackupError;
}
