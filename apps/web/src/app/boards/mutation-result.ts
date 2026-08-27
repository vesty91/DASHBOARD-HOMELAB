import { TRPCError } from "@trpc/server";

export type BoardMutationFailureCode =
  "CONFLICT" | "VALIDATION_ERROR" | "FORBIDDEN" | "UNAUTHORIZED" | "NOT_FOUND" | "UNKNOWN";

export type BoardMutationFailure = {
  ok: false;
  code: BoardMutationFailureCode;
  message: string;
};

export type BoardMutationOk<T extends object = { revision: number }> = { ok: true } & T;

export type BoardMutationResult<T extends object = { revision: number }> =
  BoardMutationOk<T> | BoardMutationFailure;

const SAFE_MESSAGES: Record<BoardMutationFailureCode, string> = {
  CONFLICT: "Le board a été modifié ailleurs.",
  VALIDATION_ERROR: "Les données saisies sont invalides.",
  FORBIDDEN: "Permission insuffisante.",
  UNAUTHORIZED: "Session expirée. Reconnectez-vous.",
  NOT_FOUND: "Élément introuvable.",
  UNKNOWN: "La sauvegarde a échoué.",
};

export function conflictFailure(): BoardMutationFailure {
  return { ok: false, code: "CONFLICT", message: SAFE_MESSAGES.CONFLICT };
}

export function unknownFailure(): BoardMutationFailure {
  return { ok: false, code: "UNKNOWN", message: SAFE_MESSAGES.UNKNOWN };
}

function clientSafeMessage(message: string, fallback: string): string {
  if (!message || message.length > 240 || message.includes("\n") || /\bat\s+\S+/.test(message))
    return fallback;
  return message;
}

function codeFromTrpc(code: TRPCError["code"]): BoardMutationFailureCode {
  switch (code) {
    case "CONFLICT":
      return "CONFLICT";
    case "BAD_REQUEST":
    case "PARSE_ERROR":
    case "UNPROCESSABLE_CONTENT":
      return "VALIDATION_ERROR";
    case "FORBIDDEN":
      return "FORBIDDEN";
    case "UNAUTHORIZED":
      return "UNAUTHORIZED";
    case "NOT_FOUND":
      return "NOT_FOUND";
    default:
      return "UNKNOWN";
  }
}

export function toBoardMutationFailure(error: unknown): BoardMutationFailure {
  if (error instanceof TRPCError) {
    const code = codeFromTrpc(error.code);
    return {
      ok: false,
      code,
      message: clientSafeMessage(error.message, SAFE_MESSAGES[code]),
    };
  }
  return unknownFailure();
}
