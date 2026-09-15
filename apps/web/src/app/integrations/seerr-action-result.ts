import { TRPCError } from "@trpc/server";
import { seerrUserError } from "./seerr-error";

export type SeerrActionOutcome = { ok: true } | { ok: false; message: string };

export function toSeerrActionOutcome(error: unknown): SeerrActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: seerrUserError(error) };
  return { ok: false, message: seerrUserError(error) };
}
