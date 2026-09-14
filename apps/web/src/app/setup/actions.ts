"use server";
import { createAuthService, createInMemoryActionRateLimiter } from "@dashboard/auth";
import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/server/database";

const setupLimiter = createInMemoryActionRateLimiter(5, 300_000);

export async function setupAction(formData: FormData) {
  if (!setupLimiter.tryConsume("setup")) {
    throw new Error("RATE_LIMITED");
  }
  const { authStore } = await getDatabase();
  await createAuthService(authStore).onboard({
    username: String(formData.get("username") ?? ""),
    displayName: String(formData.get("displayName") ?? "") || undefined,
    password: String(formData.get("password") ?? ""),
  });
  redirect("/login?setup=complete");
}
