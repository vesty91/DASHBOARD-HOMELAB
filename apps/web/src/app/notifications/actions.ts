"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import type { NotificationView } from "@dashboard/notifications";
import { getBoardCaller } from "@/lib/server/board-api";

export type NotificationActionResult = { ok: true } | { ok: false; code: string; message: string };

function mapError(error: unknown): { code: string; message: string } {
  if (error instanceof TRPCError) {
    return {
      code: error.code,
      message: error.message || "Action impossible.",
    };
  }
  if (error instanceof Error) return { code: "INTERNAL_ERROR", message: error.message };
  return { code: "INTERNAL_ERROR", message: "Action impossible." };
}

export async function getNotificationPermissionsAction(): Promise<{
  canRead: boolean;
  canManage: boolean;
}> {
  try {
    const caller = await getBoardCaller();
    return await caller.notification.permissions();
  } catch {
    return { canRead: false, canManage: false };
  }
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  try {
    const caller = await getBoardCaller();
    return await caller.notification.unreadCount();
  } catch {
    return 0;
  }
}

export async function listNotificationsAction(input?: {
  limit?: number;
  cursor?: string;
}): Promise<{ items: NotificationView[]; nextCursor: string | null }> {
  try {
    const caller = await getBoardCaller();
    return await caller.notification.list({
      limit: input?.limit ?? 30,
      ...(input?.cursor ? { cursor: input.cursor } : {}),
      includeDismissed: false,
    });
  } catch {
    return { items: [], nextCursor: null };
  }
}

export async function markNotificationReadAction(
  id: string,
): Promise<{ ok: true; item: NotificationView } | NotificationActionResult> {
  try {
    const caller = await getBoardCaller();
    const item = await caller.notification.markRead({ id });
    revalidatePath("/notifications");
    return { ok: true, item };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function markAllNotificationsReadAction(): Promise<
  { ok: true; updated: number } | NotificationActionResult
> {
  try {
    const caller = await getBoardCaller();
    const result = await caller.notification.markAllRead();
    revalidatePath("/notifications");
    return { ok: true, updated: result.updated };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function dismissNotificationAction(
  id: string,
): Promise<{ ok: true; item: NotificationView } | NotificationActionResult> {
  try {
    const caller = await getBoardCaller();
    const item = await caller.notification.dismiss({ id });
    revalidatePath("/notifications");
    return { ok: true, item };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function issueNotificationRealtimeTicketAction(): Promise<{
  token: string;
  expiresAt: string;
} | null> {
  try {
    return await (await getBoardCaller()).realtime.ticket({ notifications: true });
  } catch (error) {
    void error;
    return null;
  }
}

export async function markNotificationReadFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await markNotificationReadAction(id);
}

export async function markAllNotificationsReadFormAction(): Promise<void> {
  await markAllNotificationsReadAction();
}

export async function dismissNotificationFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await dismissNotificationAction(id);
}
