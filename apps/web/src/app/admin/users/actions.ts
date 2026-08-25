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
export async function createUserAction(formData: FormData) {
  await requireServerPermission("user.manage");
  const username = usernameSchema.parse(String(formData.get("username") ?? ""));
  const password = passwordSchema.parse(String(formData.get("password") ?? ""));
  const role = String(formData.get("role") ?? "VIEWER");
  if (!ROLE_NAMES.includes(role as (typeof ROLE_NAMES)[number]) || role === "SYSTEM_ADMIN")
    throw new Error("Invalid role");
  const { authStore } = await getDatabase();
  await authStore.createLocalUser({
    username,
    usernameCanonical: canonicalizeUsername(username),
    displayName: String(formData.get("displayName") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    passwordHash: await hashPassword(password),
    roleName: role,
  });
  revalidatePath("/admin/users");
}
export async function setStatusAction(formData: FormData) {
  await requireServerPermission("user.manage");
  const { authStore } = await getDatabase();
  await authStore.setUserStatus(
    String(formData.get("userId")),
    String(formData.get("status")) === "disabled" ? "disabled" : "active",
  );
  revalidatePath("/admin/users");
}
