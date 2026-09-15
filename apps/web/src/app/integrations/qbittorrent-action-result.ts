import { TRPCError } from "@trpc/server";
import { qbittorrentUserError } from "./qbittorrent-error";

export type QbittorrentActionOutcome = { ok: true } | { ok: false; message: string };

export function toQbittorrentActionOutcome(error: unknown): QbittorrentActionOutcome {
  if (error instanceof TRPCError || (error && typeof error === "object" && "code" in error))
    return { ok: false, message: qbittorrentUserError(error) };
  return { ok: false, message: qbittorrentUserError(error) };
}
