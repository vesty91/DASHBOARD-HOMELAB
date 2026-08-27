"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBoardCaller } from "../../lib/server/board-api";

const input = (formData: FormData) => ({
  name: String(formData.get("name") ?? ""),
  description: String(formData.get("description") ?? ""),
  url: String(formData.get("url") ?? ""),
  iconRef: String(formData.get("iconRef") ?? "") || null,
  color: String(formData.get("color") ?? "") || null,
  target: String(formData.get("target") ?? "new-tab") as "same-tab" | "new-tab",
  tags: String(formData.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean),
  healthcheckEnabled: formData.get("healthcheckEnabled") === "on",
  healthcheckConfig: {
    path: String(formData.get("healthPath") ?? "/"),
    method: String(formData.get("healthMethod") ?? "GET") as "GET" | "HEAD",
    timeoutMs: Number(formData.get("timeoutMs") ?? 5000),
    expectedStatusMin: Number(formData.get("expectedStatusMin") ?? 200),
    expectedStatusMax: Number(formData.get("expectedStatusMax") ?? 399),
  },
});
export async function createAppAction(formData: FormData) {
  await (await getBoardCaller()).app.create(input(formData));
  redirect("/apps");
}
export async function updateAppAction(id: string, formData: FormData) {
  await (await getBoardCaller()).app.update({ id, ...input(formData) });
  revalidatePath("/apps");
  redirect("/apps");
}
export async function deleteAppAction(id: string) {
  await (await getBoardCaller()).app.delete({ id });
  revalidatePath("/apps");
}
export async function testAppAction(id: string) {
  await (await getBoardCaller()).app.test({ id });
  revalidatePath("/apps");
}
