"use server";
import { createAuthService } from "@dashboard/auth";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/server/database";
export async function setupAction(formData: FormData) {
  const { authStore } = await getDatabase();
  await createAuthService(authStore).onboard({
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? "") || undefined,
    password: String(formData.get("password") ?? ""),
  });
  redirect("/login?setup=complete");
}
