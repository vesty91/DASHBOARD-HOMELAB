"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { getBoardCaller } from "@/lib/server/board-api";

export type StatusPageActionResult = { ok: true } | { ok: false; code: string; message: string };

export type StatusPageCreateResult =
  { ok: true; id: string } | { ok: false; code: string; message: string };

function mapError(error: unknown): { code: string; message: string } {
  if (error instanceof TRPCError) {
    return {
      code: error.code,
      message:
        error.code === "CONFLICT"
          ? "La configuration a changé. Rechargez la page puis réessayez."
          : error.message || "Action impossible.",
    };
  }
  if (error instanceof Error) return { code: "INTERNAL_ERROR", message: error.message };
  return { code: "INTERNAL_ERROR", message: "Action impossible." };
}

function revalidateStatusPaths(id?: string, slug?: string) {
  revalidatePath("/status-pages");
  if (id) {
    revalidatePath(`/status-pages/${id}`);
    revalidatePath(`/status-pages/maintenance/${id}`);
  }
  if (slug) revalidatePath(`/status/${slug}`);
}

export async function createStatusPageAction(input: {
  name: string;
  slug: string;
  description?: string;
  visibility?: "private" | "public";
  enabled?: boolean;
}): Promise<StatusPageCreateResult> {
  try {
    const created = await (
      await getBoardCaller()
    ).statusPage.create({
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
      visibility: input.visibility ?? "private",
      enabled: input.enabled ?? true,
    });
    revalidateStatusPaths(created.id, created.slug);
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function updateStatusPageAction(input: {
  id: string;
  expectedConfigRevision: number;
  name: string;
  slug: string;
  description?: string;
  visibility: "private" | "public";
  enabled: boolean;
}): Promise<StatusPageActionResult> {
  try {
    const updated = await (
      await getBoardCaller()
    ).statusPage.update({
      ...input,
      description: input.description ?? "",
    });
    revalidateStatusPaths(updated.id, updated.slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function deleteStatusPageAction(input: {
  id: string;
  expectedConfigRevision: number;
  slug?: string;
}): Promise<StatusPageActionResult> {
  try {
    await (
      await getBoardCaller()
    ).statusPage.delete({
      id: input.id,
      expectedConfigRevision: input.expectedConfigRevision,
    });
    revalidateStatusPaths(input.id, input.slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function replaceStatusPageServicesAction(input: {
  statusPageId: string;
  expectedConfigRevision: number;
  services: Array<{
    sourceIntegrationId: string;
    displayName: string;
    description?: string;
    sortOrder: number;
    showIncidentHistory?: boolean;
  }>;
}): Promise<StatusPageActionResult> {
  try {
    const updated = await (
      await getBoardCaller()
    ).statusPage.replaceServices({
      statusPageId: input.statusPageId,
      expectedConfigRevision: input.expectedConfigRevision,
      services: input.services.map((service) => ({
        sourceIntegrationId: service.sourceIntegrationId,
        displayName: service.displayName,
        description: service.description ?? "",
        sortOrder: service.sortOrder,
        showIncidentHistory: service.showIncidentHistory ?? true,
      })),
    });
    revalidateStatusPaths(updated.id, updated.slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function scheduleMaintenanceAction(input: {
  name: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  integrationIds: string[];
}): Promise<{ ok: true; id: string } | { ok: false; code: string; message: string }> {
  try {
    const created = await (
      await getBoardCaller()
    ).statusPage.scheduleMaintenance({
      name: input.name,
      description: input.description ?? "",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      integrationIds: input.integrationIds,
    });
    revalidatePath("/status-pages");
    revalidatePath(`/status-pages/maintenance/${created.id}`);
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function cancelMaintenanceAction(id: string): Promise<StatusPageActionResult> {
  try {
    await (await getBoardCaller()).statusPage.cancelMaintenance({ id });
    revalidatePath("/status-pages");
    revalidatePath(`/status-pages/maintenance/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function cancelMaintenanceFormAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await cancelMaintenanceAction(id);
}

export async function fetchPublicStatusPageAction(slug: string) {
  try {
    const dto = await (await getBoardCaller()).statusPage.getPublic({ slug });
    return { ok: true as const, page: dto };
  } catch (error) {
    return { ok: false as const, ...mapError(error) };
  }
}
