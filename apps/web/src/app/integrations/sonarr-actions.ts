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
