"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import type { PushSubscriptionView } from "@dashboard/notifications";
import { getBoardCaller } from "@/lib/server/board-api";

export type PushActionFailure = { ok: false; code: string; message: string };

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

export async function getPushPermissionsAction(): Promise<{
  canRead: boolean;
  canManage: boolean;
  vapidConfigured: boolean;
}> {
  try {
    const caller = await getBoardCaller();
    return await caller.push.permissions();
  } catch {
    return { canRead: false, canManage: false, vapidConfigured: false };
  }
}

export async function getPushVapidPublicKeyAction(): Promise<string | null> {
  try {
    const caller = await getBoardCaller();
    const result = await caller.push.vapidPublicKey();
    return result.publicKey;
  } catch {
    return null;
  }
}

export async function listPushSubscriptionsAction(): Promise<{ items: PushSubscriptionView[] }> {
  try {
    const caller = await getBoardCaller();
    return await caller.push.list();
  } catch {
    return { items: [] };
  }
}

export async function subscribePushAction(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string | null;
}): Promise<{ ok: true; item: PushSubscriptionView } | PushActionFailure> {
  try {
    const caller = await getBoardCaller();
    const item = await caller.push.subscribe(input);
    revalidatePath("/account/security");
    return { ok: true, item };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function unsubscribePushAction(input: {
  id?: string;
  endpoint?: string;
}): Promise<{ ok: true; removed: boolean } | PushActionFailure> {
  try {
    const caller = await getBoardCaller();
    const result = await caller.push.unsubscribe(input);
    revalidatePath("/account/security");
    return { ok: true, removed: result.removed };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function unsubscribeAllPushAction(): Promise<
  { ok: true; removed: number } | PushActionFailure
> {
  try {
    const caller = await getBoardCaller();
    const result = await caller.push.unsubscribeAll();
    revalidatePath("/account/security");
    return { ok: true, removed: result.removed };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}
