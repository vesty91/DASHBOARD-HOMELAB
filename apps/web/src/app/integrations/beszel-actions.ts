"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toBeszelActionOutcome, type BeszelActionOutcome } from "./beszel-action-result";

export async function refreshBeszelOverviewAction(
  integrationId: string,
): Promise<BeszelActionOutcome> {
  try {
    await (await getBoardCaller()).beszel.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toBeszelActionOutcome(error);
  }
}
