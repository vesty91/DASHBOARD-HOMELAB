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

type QuickAppPreset = {
  url: string;
  healthPath: string;
  expectedStatusMin: number;
  expectedStatusMax: number;
};

const quickAppPresets: Record<string, QuickAppPreset> = {
  portainer: {
    url: "https://portainer.restor-pc.fr/",
    healthPath: "/api/status",
    expectedStatusMin: 200,
    expectedStatusMax: 299,
  },
  vaultwarden: {
    url: "https://mdp.restor-pc.fr/",
    healthPath: "/alive",
    expectedStatusMin: 200,
    expectedStatusMax: 299,
  },
  "uptime-kuma": {
    url: "https://uptime.restor-pc.fr/",
    healthPath: "/",
    expectedStatusMin: 200,
    expectedStatusMax: 399,
  },
  dozzle: {
    url: "https://dozzle.restor-pc.fr/",
    healthPath: "/",
    expectedStatusMin: 401,
    expectedStatusMax: 401,
  },
};

export async function quickCreateAppAction(templateId: string) {
  const preset = quickAppPresets[templateId];
  if (!preset) redirect(`/apps/new?template=${encodeURIComponent(templateId)}`);

  let destination = "/apps";

  try {
    const caller = await getBoardCaller();
    const template = await caller.app.library.get({ id: templateId });
    const normalizedUrl = new URL(preset.url).toString();
    const existing = await caller.app.list({ limit: 100 });

    if (existing.items.some((app) => app.url === normalizedUrl)) {
      destination = "/apps?quickAdd=exists";
    } else {
      const created = await caller.app.create({
        name: template.name,
        description: template.description,
        url: normalizedUrl,
        iconRef: template.icon.path,
        color: null,
        target: template.defaults?.target ?? "new-tab",
        tags: [...template.tags],
        healthcheckEnabled: true,
        healthcheckConfig: {
          path: preset.healthPath,
          method: "GET",
          timeoutMs: 5000,
          expectedStatusMin: preset.expectedStatusMin,
          expectedStatusMax: preset.expectedStatusMax,
        },
      });

      try {
        await caller.app.test({ id: created.id });
      } catch (error) {
        console.error("quick_app_healthcheck_failed", {
          templateId,
          message: error instanceof Error ? error.message : String(error),
        });
      }

      destination = "/apps?quickAdd=created";
      revalidatePath("/apps");
    }
  } catch (error) {
    console.error("quick_app_create_failed", {
      templateId,
      message: error instanceof Error ? error.message : String(error),
    });
    destination = "/apps?quickAdd=failed";
  }

  redirect(destination);
}

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
