"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import {
  toPrometheusActionOutcome,
  type PrometheusActionOutcome,
} from "./prometheus-action-result";

export async function refreshPrometheusOverviewAction(
  integrationId: string,
): Promise<PrometheusActionOutcome> {
  try {
    await (await getBoardCaller()).prometheus.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toPrometheusActionOutcome(error);
  }
}
