"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "../../lib/server/board-api";
import { toSeerrActionOutcome, type SeerrActionOutcome } from "./seerr-action-result";

export async function refreshSeerrOverviewAction(
  integrationId: string,
): Promise<SeerrActionOutcome> {
  try {
    await (await getBoardCaller()).seerr.overview.refresh({ integrationId });
    revalidatePath(`/integrations/${integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSeerrActionOutcome(error);
  }
}

export async function approveSeerrRequestAction(input: {
  integrationId: string;
  requestId: number;
}): Promise<SeerrActionOutcome> {
  try {
    await (await getBoardCaller()).seerr.requests.approve(input);
    revalidatePath(`/integrations/${input.integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSeerrActionOutcome(error);
  }
}

export async function declineSeerrRequestAction(input: {
  integrationId: string;
  requestId: number;
}): Promise<SeerrActionOutcome> {
  try {
    await (await getBoardCaller()).seerr.requests.decline(input);
    revalidatePath(`/integrations/${input.integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toSeerrActionOutcome(error);
  }
}
