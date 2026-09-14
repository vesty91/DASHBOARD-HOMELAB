"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toGrafanaActionOutcome, type GrafanaActionOutcome } from "./grafana-action-result";

export async function refreshGrafanaOverviewAction(
  integrationId: string,
): Promise<GrafanaActionOutcome> {
  try {
    await (await getBoardCaller()).grafana.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toGrafanaActionOutcome(error);
  }
}
