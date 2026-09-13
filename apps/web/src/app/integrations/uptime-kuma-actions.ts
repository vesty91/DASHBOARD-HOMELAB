"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import {
  toUptimeKumaActionOutcome,
  type UptimeKumaActionOutcome,
} from "./uptime-kuma-action-result";

export async function refreshUptimeKumaOverviewAction(
  integrationId: string,
): Promise<UptimeKumaActionOutcome> {
  try {
    await (await getBoardCaller()).uptimeKuma.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toUptimeKumaActionOutcome(error);
  }
}
