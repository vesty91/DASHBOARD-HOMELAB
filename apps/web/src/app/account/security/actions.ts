"use server";
import { createAuthService } from "@dashboard/auth";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { recordAudit } from "@/lib/server/security-services";

export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const { authStore, securityStore } = await getDatabase();
  await createAuthService(authStore).changePassword(
    session.user.id,
    String(formData.get("currentPassword") ?? ""),
    String(formData.get("newPassword") ?? ""),
  );
  await securityStore.revokeAllSessions(session.user.id);
  await recordAudit({
    actorUserId: session.user.id,
    action: "user.update",
    targetType: "user",
    targetId: session.user.id,
    outcome: "success",
    metadata: { operation: "password_change" },
  });
  redirect("/login?password=changed");
}
