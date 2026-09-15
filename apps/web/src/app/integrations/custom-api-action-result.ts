import { TRPCError } from "@trpc/server";
import { customApiUserError } from "./custom-api-error";

export type CustomApiActionOutcome = { ok: true } | { ok: false; message: string };

export function toCustomApiActionOutcome(error: unknown): CustomApiActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: customApiUserError(error) };
  return { ok: false, message: customApiUserError(error) };
}
