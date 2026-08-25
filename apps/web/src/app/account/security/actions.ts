"use server";
import { createAuthService } from "@dashboard/auth";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
export async function changePasswordAction(formData: FormData) {
  const session = await requireSession();
  const { authStore } = await getDatabase();
  await createAuthService(authStore).changePassword(
    session.user.id,
    String(formData.get("currentPassword") ?? ""),
    String(formData.get("newPassword") ?? ""),
  );
  redirect("/login?password=changed");
}
