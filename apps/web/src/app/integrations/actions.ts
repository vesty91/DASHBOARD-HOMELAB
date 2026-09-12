"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBoardCaller } from "../../lib/server/board-api";
import { configFromForm } from "./integration-form-config";

export async function createIntegrationAction(formData: FormData) {
  const caller = await getBoardCaller();
  const type = String(formData.get("type") ?? "");
  const created = await caller.integration.create({
    type,
    name: String(formData.get("name") ?? ""),
    baseUrl: String(formData.get("baseUrl") ?? ""),
    enabled: formData.get("enabled") === "on",
    config: configFromForm(formData),
  });
  if (type === "synology") redirect(`/integrations/${created.id}/edit`);
  redirect("/integrations");
}

export async function updateIntegrationAction(id: string, formData: FormData) {
  await (
    await getBoardCaller()
  ).integration.update({
    id,
    name: String(formData.get("name") ?? ""),
    baseUrl: String(formData.get("baseUrl") ?? ""),
    enabled: formData.get("enabled") === "on",
    config: configFromForm(formData),
  });
  revalidatePath("/integrations");
  redirect("/integrations");
}

export async function setIntegrationSecretAction(integrationId: string, formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const value = String(formData.get("value") ?? "");
  await (await getBoardCaller()).integration.setSecret({ integrationId, key, value });
  revalidatePath(`/integrations/${integrationId}/edit`);
  revalidatePath("/integrations");
}

export async function deleteIntegrationAction(id: string) {
  await (await getBoardCaller()).integration.delete({ id });
  revalidatePath("/integrations");
}

export async function testIntegrationAction(id: string) {
  await (await getBoardCaller()).integration.test({ id });
  revalidatePath("/integrations");
}
