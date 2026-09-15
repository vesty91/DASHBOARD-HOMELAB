"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toCustomApiActionOutcome, type CustomApiActionOutcome } from "./custom-api-action-result";

export async function refreshCustomApiOverviewAction(
  integrationId: string,
): Promise<CustomApiActionOutcome> {
  try {
    await (await getBoardCaller()).customApi.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toCustomApiActionOutcome(error);
  }
}
