"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toJellyfinActionOutcome, type JellyfinActionOutcome } from "./jellyfin-action-result";

export async function refreshJellyfinOverviewAction(
  integrationId: string,
): Promise<JellyfinActionOutcome> {
  try {
    await (await getBoardCaller()).jellyfin.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toJellyfinActionOutcome(error);
  }
}
