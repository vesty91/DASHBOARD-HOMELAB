"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toSeerrActionOutcome, type SeerrActionOutcome } from "./seerr-action-result";

export async function refreshSeerrOverviewAction(
  integrationId: string,
): Promise<SeerrActionOutcome> {
  try {
    await (await getBoardCaller()).seerr.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSeerrActionOutcome(error);
  }
}
