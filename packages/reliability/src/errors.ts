export class ReliabilityError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "ReliabilityError";
    this.code = code;
  }
}

export function isReliabilityError(error: unknown): error is ReliabilityError {
  return error instanceof ReliabilityError;
}
