"use server";

import { getAuthOptions } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { recordAudit } from "@/lib/server/security-services";
import { getServerSession } from "next-auth";

export async function revokeCurrentSessionAction() {
  const session = await getServerSession(await getAuthOptions());
  if (!session?.user?.id || !session.sessionId) return;
  const { securityStore } = await getDatabase();
  await securityStore.revokeSession(session.sessionId, session.user.id);
  await recordAudit({
    actorUserId: session.user.id,
    action: "auth.logout",
    targetType: "session",
    targetId: session.sessionId,
    outcome: "success",
    sessionId: session.sessionId,
  });
}
