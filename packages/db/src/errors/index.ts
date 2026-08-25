export const DATABASE_ERROR_CODES = [
  "DB_UNAVAILABLE",
  "UNIQUE_CONSTRAINT",
  "FOREIGN_KEY_CONSTRAINT",
  "NOT_FOUND",
  "TRANSACTION_FAILED",
  "UNKNOWN_DB_ERROR",
] as const;
export type DatabaseErrorCode = (typeof DATABASE_ERROR_CODES)[number];
export class DatabaseError extends Error {
  constructor(
    public readonly code: DatabaseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DatabaseError";
  }
}
export function normalizeDatabaseError(error: unknown): DatabaseError {
  if (error instanceof DatabaseError) return error;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  if (
    ["23505", "SQLITE_CONSTRAINT_UNIQUE"].includes(code) ||
    message.includes("UNIQUE constraint failed")
  )
    return new DatabaseError("UNIQUE_CONSTRAINT", "A unique database constraint was violated", {
      cause: error,
    });
  if (
    ["23503", "SQLITE_CONSTRAINT_FOREIGNKEY"].includes(code) ||
    message.includes("FOREIGN KEY constraint failed")
  )
    return new DatabaseError("FOREIGN_KEY_CONSTRAINT", "A foreign key constraint was violated", {
      cause: error,
    });
  if (["ECONNREFUSED", "57P01", "57P03"].includes(code))
    return new DatabaseError("DB_UNAVAILABLE", "The database is unavailable", { cause: error });
  return new DatabaseError("UNKNOWN_DB_ERROR", "An unexpected database error occurred", {
    cause: error,
  });
}
