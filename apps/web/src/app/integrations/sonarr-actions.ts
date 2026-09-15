"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toSonarrActionOutcome, type SonarrActionOutcome } from "./sonarr-action-result";

export async function refreshSonarrOverviewAction(
  integrationId: string,
): Promise<SonarrActionOutcome> {
  try {
    await (await getBoardCaller()).sonarr.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSonarrActionOutcome(error);
  }
}

export async function refreshSonarrSeriesAction(input: {
  integrationId: string;
  seriesId: number;
}): Promise<SonarrActionOutcome> {
  try {
    await (await getBoardCaller()).sonarr.series.refresh(input);
    revalidatePath(`/integrations/${input.integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSonarrActionOutcome(error);
  }
}

export async function searchSonarrEpisodeAction(input: {
  integrationId: string;
  episodeId: number;
}): Promise<SonarrActionOutcome> {
  try {
    await (await getBoardCaller()).sonarr.episodes.search(input);
    revalidatePath(`/integrations/${input.integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSonarrActionOutcome(error);
  }
}
