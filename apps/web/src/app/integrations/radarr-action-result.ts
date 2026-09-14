import { TRPCError } from "@trpc/server";
import { radarrUserError } from "./radarr-error";

export type RadarrActionOutcome = { ok: true } | { ok: false; message: string };

export function toRadarrActionOutcome(error: unknown): RadarrActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: radarrUserError(error) };
  return { ok: false, message: radarrUserError(error) };
}
