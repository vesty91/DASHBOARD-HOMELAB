import { TRPCError } from "@trpc/server";
import { jellyfinUserError } from "./jellyfin-error";

export type JellyfinActionOutcome = { ok: true } | { ok: false; message: string };

export function toJellyfinActionOutcome(error: unknown): JellyfinActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: jellyfinUserError(error) };
  return { ok: false, message: jellyfinUserError(error) };
}
