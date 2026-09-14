import { TRPCError } from "@trpc/server";
import { ntfyUserError } from "./ntfy-error";

export type NtfyActionOutcome = { ok: true } | { ok: false; message: string };

export function toNtfyActionOutcome(error: unknown): NtfyActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: ntfyUserError(error) };
  return { ok: false, message: ntfyUserError(error) };
}
