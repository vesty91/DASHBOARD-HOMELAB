import { TRPCError } from "@trpc/server";
import { sonarrUserError } from "./sonarr-error";

export type SonarrActionOutcome = { ok: true } | { ok: false; message: string };

export function toSonarrActionOutcome(error: unknown): SonarrActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: sonarrUserError(error) };
  return { ok: false, message: sonarrUserError(error) };
}
