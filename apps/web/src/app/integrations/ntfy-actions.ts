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

export async function publishNtfyAction(input: {
  integrationId: string;
  topic: string;
  message: string;
  title?: string;
  priority: "min" | "low" | "default" | "high" | "max";
  tags?: readonly string[];
}): Promise<NtfyActionOutcome> {
  try {
    await (
      await getBoardCaller()
    ).ntfy.publish({
      integrationId: input.integrationId,
      topic: input.topic,
      message: input.message,
      priority: input.priority,
      ...(input.title === undefined || input.title.trim() === ""
        ? {}
        : { title: input.title.trim() }),
      ...(input.tags === undefined || input.tags.length === 0 ? {} : { tags: [...input.tags] }),
    });
    revalidatePath(`/integrations/${input.integrationId}`);
    revalidatePath("/boards");
    return { ok: true };
  } catch (error) {
    return toNtfyActionOutcome(error);
  }
}
