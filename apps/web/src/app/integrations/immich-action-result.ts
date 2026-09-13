import { TRPCError } from "@trpc/server";
import { immichUserError } from "./immich-error";

export type ImmichActionOutcome = { ok: true } | { ok: false; message: string };

export function toImmichActionOutcome(error: unknown): ImmichActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: immichUserError(error) };
  return { ok: false, message: immichUserError(error) };
}
