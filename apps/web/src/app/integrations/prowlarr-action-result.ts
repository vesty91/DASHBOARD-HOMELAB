import { TRPCError } from "@trpc/server";
import { prowlarrUserError } from "./prowlarr-error";

export type ProwlarrActionOutcome = { ok: true } | { ok: false; message: string };

export function toProwlarrActionOutcome(error: unknown): ProwlarrActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: prowlarrUserError(error) };
  return { ok: false, message: prowlarrUserError(error) };
}
