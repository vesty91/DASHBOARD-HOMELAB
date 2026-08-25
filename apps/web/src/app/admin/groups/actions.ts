"use server";
import { ROLE_NAMES } from "@dashboard/permissions";
import { revalidatePath } from "next/cache";
import { requireServerPermission } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
export async function createGroupAction(formData: FormData) {
  await requireServerPermission("group.manage");
  const { authStore } = await getDatabase();
  const group = await authStore.createGroup({
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "") || null,
  });
  const role = String(formData.get("role") ?? "VIEWER");
  if (!ROLE_NAMES.includes(role as (typeof ROLE_NAMES)[number]) || role === "SYSTEM_ADMIN")
    throw new Error("Invalid role");
  await authStore.assignGroupRole(group.id, role);
  const userId = String(formData.get("userId") ?? "");
  if (userId) await authStore.addGroupMember(group.id, userId);
  revalidatePath("/admin/groups");
}
