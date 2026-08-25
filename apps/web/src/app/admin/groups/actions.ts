"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireServerPermission } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";

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
