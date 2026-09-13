"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toImmichActionOutcome, type ImmichActionOutcome } from "./immich-action-result";

export async function refreshImmichOverviewAction(
  integrationId: string,
): Promise<ImmichActionOutcome> {
  try {
    await (await getBoardCaller()).immich.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toImmichActionOutcome(error);
  }
}
