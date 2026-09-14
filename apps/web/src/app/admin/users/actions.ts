"use server";
import {
  canonicalizeUsername,
  hashPassword,
  usernameSchema,
  passwordSchema,
} from "@dashboard/auth";
import { ROLE_NAMES } from "@dashboard/permissions";
import { revalidatePath } from "next/cache";
import { requireServerPermission } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { recordAudit } from "@/lib/server/security-services";

export async function createUserAction(formData: FormData) {
  const session = await requireServerPermission("user.manage");
  const username = usernameSchema.parse(String(formData.get("username") ?? ""));
  const password = passwordSchema.parse(String(formData.get("password") ?? ""));
  const role = String(formData.get("role") ?? "VIEWER");
  if (!ROLE_NAMES.includes(role as (typeof ROLE_NAMES)[number]) || role === "SYSTEM_ADMIN")
    throw new Error("Invalid role");
  const { authStore } = await getDatabase();
  const created = await authStore.createLocalUser({
    username,
    usernameCanonical: canonicalizeUsername(username),
    displayName: String(formData.get("displayName") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    passwordHash: await hashPassword(password),
    roleName: role,
  });
  await recordAudit({
    actorUserId: session.user.id,
    action: "user.update",
    targetType: "user",
    targetId: created.id,
    outcome: "success",
    metadata: { operation: "create", role },
  });
  revalidatePath("/admin/users");
}

export async function setStatusAction(formData: FormData) {
  const session = await requireServerPermission("user.manage");
  const userId = String(formData.get("userId"));
  const status = String(formData.get("status")) === "disabled" ? "disabled" : "active";
  const { authStore, securityStore } = await getDatabase();
  await authStore.setUserStatus(userId, status);
  if (status === "disabled") await securityStore.revokeAllSessions(userId);
  await recordAudit({
    actorUserId: session.user.id,
    action: "user.update",
    targetType: "user",
    targetId: userId,
    outcome: "success",
    metadata: { operation: "status", status },
  });
  revalidatePath("/admin/users");
}
