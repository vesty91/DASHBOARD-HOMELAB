"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { synologyActionFailure, type SynologyActionOutcome } from "./synology-action-result";

export async function refreshSynologyOverviewAction(
  integrationId: string,
): Promise<SynologyActionOutcome> {
  try {
    await (await getBoardCaller()).synology.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    return { ok: true };
  } catch (error) {
    return synologyActionFailure(error);
  }
}

export async function enrollSynologyDeviceAction(
  integrationId: string,
  formData: FormData,
): Promise<SynologyActionOutcome> {
  try {
    await (
      await getBoardCaller()
    ).synology.auth.enrollDevice({
      integrationId,
      otpCode: String(formData.get("otpCode") ?? ""),
    });
    revalidatePath(`/integrations/${integrationId}/edit`);
    return { ok: true };
  } catch (error) {
    return synologyActionFailure(error);
  }
}

export async function clearSynologyDeviceAction(
  integrationId: string,
): Promise<SynologyActionOutcome> {
  try {
    await (await getBoardCaller()).synology.auth.clearDevice({ integrationId });
    revalidatePath(`/integrations/${integrationId}/edit`);
    return { ok: true };
  } catch (error) {
    return synologyActionFailure(error);
  }
}
