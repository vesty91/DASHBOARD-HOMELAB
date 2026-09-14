"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "@/lib/server/board-api";

export async function revokeOwnSessionAction(sessionId: string) {
  await (await getBoardCaller()).session.revokeSelf({ sessionId });
  revalidatePath("/account/security");
}

export async function revokeOtherSessionsAction() {
  await (await getBoardCaller()).session.revokeOthers();
  revalidatePath("/account/security");
}
