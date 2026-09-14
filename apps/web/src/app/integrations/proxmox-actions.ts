"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toProxmoxActionOutcome, type ProxmoxActionOutcome } from "./proxmox-action-result";

export async function refreshProxmoxOverviewAction(
  integrationId: string,
): Promise<ProxmoxActionOutcome> {
  try {
    await (await getBoardCaller()).proxmox.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toProxmoxActionOutcome(error);
  }
}
