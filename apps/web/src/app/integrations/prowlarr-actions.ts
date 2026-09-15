"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toProwlarrActionOutcome, type ProwlarrActionOutcome } from "./prowlarr-action-result";

export async function refreshProwlarrOverviewAction(
  integrationId: string,
): Promise<ProwlarrActionOutcome> {
  try {
    await (await getBoardCaller()).prowlarr.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toProwlarrActionOutcome(error);
  }
}
