import { TRPCError } from "@trpc/server";
import { beszelUserError } from "./beszel-error";

export type BeszelActionOutcome = { ok: true } | { ok: false; message: string };

export function toBeszelActionOutcome(error: unknown): BeszelActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: beszelUserError(error) };
  return { ok: false, message: beszelUserError(error) };
}
