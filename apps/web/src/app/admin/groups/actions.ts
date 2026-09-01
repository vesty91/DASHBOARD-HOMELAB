"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { canAssignGroupPermissionGrants } from "@dashboard/permissions";
import { requireServerPermission, requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { groupPermissionGrantsInputSchema } from "./group-permission-grants";

const createGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .transform((value) => value || null),
  roleName: z.enum(["VIEWER", "USER", "EDITOR", "ADMIN"]),
  userId: z.union([z.uuid(), z.literal("")]).transform((value) => value || null),
});

export async function createGroupAction(formData: FormData) {
  await requireServerPermission("group.manage");
  const input = createGroupInputSchema.parse({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    roleName: String(formData.get("role") ?? "VIEWER"),
    userId: String(formData.get("userId") ?? ""),
  });
  const { authStore } = await getDatabase();
  await authStore.createGroupWithRoleAndOptionalMember(input);
  revalidatePath("/admin/groups");
}

export async function setGroupPermissionGrantsAction(groupId: string, formData: FormData) {
  const session = await requireSession();
  const { authStore } = await getDatabase();
  const subject = await authStore.resolvePermissionSubject(session.user.id);
  if (!subject || !canAssignGroupPermissionGrants(subject)) redirect("/forbidden");
  const input = groupPermissionGrantsInputSchema.parse({
    groupId,
    permissions: formData.getAll("permission").map(String),
  });
  await authStore.setGroupPermissionGrants(input.groupId, input.permissions);
  revalidatePath("/admin/groups");
}
