"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toRadarrActionOutcome, type RadarrActionOutcome } from "./radarr-action-result";

export async function refreshRadarrOverviewAction(
  integrationId: string,
): Promise<RadarrActionOutcome> {
  try {
    await (await getBoardCaller()).radarr.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toRadarrActionOutcome(error);
  }
}
