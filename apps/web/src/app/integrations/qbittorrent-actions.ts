"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import {
  toQbittorrentActionOutcome,
  type QbittorrentActionOutcome,
} from "./qbittorrent-action-result";

export async function refreshQbittorrentOverviewAction(
  integrationId: string,
): Promise<QbittorrentActionOutcome> {
  try {
    await (await getBoardCaller()).qbittorrent.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toQbittorrentActionOutcome(error);
  }
}
