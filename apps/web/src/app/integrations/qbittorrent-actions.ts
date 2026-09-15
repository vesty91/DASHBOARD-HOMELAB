"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import {
  toQbittorrentActionOutcome,
  type QbittorrentActionOutcome,
} from "./qbittorrent-action-result";

export type QbittorrentTorrentActionInput = {
  integrationId: string;
  hashes: readonly string[];
};

function revalidateQbittorrent(integrationId: string) {
  revalidatePath(`/integrations/${integrationId}`);
  revalidatePath("/boards");
}

export async function refreshQbittorrentOverviewAction(
  integrationId: string,
): Promise<QbittorrentActionOutcome> {
  try {
    await (await getBoardCaller()).qbittorrent.overview.refresh({ integrationId });
    revalidateQbittorrent(integrationId);
    return { ok: true };
  } catch (error) {
    return toQbittorrentActionOutcome(error);
  }
}

export async function pauseQbittorrentTorrentsAction(
  input: QbittorrentTorrentActionInput,
): Promise<QbittorrentActionOutcome> {
  try {
    await (
      await getBoardCaller()
    ).qbittorrent.torrents.pause({
      integrationId: input.integrationId,
      hashes: [...input.hashes],
    });
    revalidateQbittorrent(input.integrationId);
    return { ok: true };
  } catch (error) {
    return toQbittorrentActionOutcome(error);
  }
}

export async function resumeQbittorrentTorrentsAction(
  input: QbittorrentTorrentActionInput,
): Promise<QbittorrentActionOutcome> {
  try {
    await (
      await getBoardCaller()
    ).qbittorrent.torrents.resume({
      integrationId: input.integrationId,
      hashes: [...input.hashes],
    });
    revalidateQbittorrent(input.integrationId);
    return { ok: true };
  } catch (error) {
    return toQbittorrentActionOutcome(error);
  }
}
