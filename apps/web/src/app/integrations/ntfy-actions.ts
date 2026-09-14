"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toNtfyActionOutcome, type NtfyActionOutcome } from "./ntfy-action-result";

export async function refreshNtfyOverviewAction(integrationId: string): Promise<NtfyActionOutcome> {
  try {
    await (await getBoardCaller()).ntfy.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toNtfyActionOutcome(error);
  }
}
