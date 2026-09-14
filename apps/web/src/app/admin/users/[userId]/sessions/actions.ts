"use server";

import { revalidatePath } from "next/cache";
import { getBoardCaller } from "@/lib/server/board-api";

export async function revokeUserSessionAction(userId: string, sessionId: string) {
  await (await getBoardCaller()).session.revokeForUser({ userId, sessionId });
  revalidatePath(`/admin/users/${userId}/sessions`);
}

export async function revokeAllUserSessionsAction(userId: string) {
  await (await getBoardCaller()).session.revokeAllForUser({ userId });
  revalidatePath(`/admin/users/${userId}/sessions`);
}
