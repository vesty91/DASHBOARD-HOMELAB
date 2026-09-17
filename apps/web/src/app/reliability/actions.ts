"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { getBoardCaller } from "@/lib/server/board-api";

export type ReliabilityActionResult = { ok: true } | { ok: false; code: string; message: string };

export type ReliabilitySloCreateResult =
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

function revalidateReliabilityPaths(serviceKey?: string) {
  revalidatePath("/reliability");
  if (serviceKey) revalidatePath(`/reliability/${serviceKey}`);
}

export async function createSloAction(input: {
  serviceKey: string;
  name: string;
  objectiveBasisPoints: number;
  windowDays: 7 | 30 | 90;
  excludeMaintenance: boolean;
  enabled: boolean;
}): Promise<ReliabilitySloCreateResult> {
  try {
    const created = await (await getBoardCaller()).reliability.createSlo(input);
    revalidateReliabilityPaths(input.serviceKey);
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function updateSloAction(input: {
  id: string;
  expectedConfigRevision: number;
  name?: string;
  objectiveBasisPoints?: number;
  windowDays?: 7 | 30 | 90;
  excludeMaintenance?: boolean;
  enabled?: boolean;
  serviceKey: string;
}): Promise<ReliabilityActionResult> {
  try {
    await (
      await getBoardCaller()
    ).reliability.updateSlo({
      id: input.id,
      expectedConfigRevision: input.expectedConfigRevision,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.objectiveBasisPoints !== undefined
        ? { objectiveBasisPoints: input.objectiveBasisPoints }
        : {}),
      ...(input.windowDays !== undefined ? { windowDays: input.windowDays } : {}),
      ...(input.excludeMaintenance !== undefined
        ? { excludeMaintenance: input.excludeMaintenance }
        : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    revalidateReliabilityPaths(input.serviceKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function deleteSloAction(input: {
  id: string;
  expectedConfigRevision: number;
  serviceKey: string;
}): Promise<ReliabilityActionResult> {
  try {
    await (
      await getBoardCaller()
    ).reliability.deleteSlo({
      id: input.id,
      expectedConfigRevision: input.expectedConfigRevision,
    });
    revalidateReliabilityPaths(input.serviceKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function rebuildReliabilityAction(input?: {
  days?: number;
  serviceKeys?: string[];
}): Promise<ReliabilityActionResult> {
  try {
    await (
      await getBoardCaller()
    ).reliability.rebuildRecent({
      days: input?.days ?? 7,
      ...(input?.serviceKeys ? { serviceKeys: input.serviceKeys } : {}),
    });
    revalidateReliabilityPaths(input?.serviceKeys?.[0]);
    revalidatePath("/reliability");
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function createAlertPolicyAction(input: {
  sloId: string;
  serviceKey: string;
  enabled?: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
  cooldownSeconds?: number;
  notifyOnRecovery?: boolean;
}): Promise<ReliabilitySloCreateResult> {
  try {
    const created = await (
      await getBoardCaller()
    ).reliability.createAlertPolicy({
      sloId: input.sloId,
      enabled: input.enabled ?? false,
      warningThreshold: input.warningThreshold ?? 1,
      criticalThreshold: input.criticalThreshold ?? 14.4,
      cooldownSeconds: input.cooldownSeconds ?? 3600,
      notifyOnRecovery: input.notifyOnRecovery ?? true,
    });
    revalidateReliabilityPaths(input.serviceKey);
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function updateAlertPolicyAction(input: {
  id: string;
  expectedConfigRevision: number;
  serviceKey: string;
  enabled?: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
  cooldownSeconds?: number;
  notifyOnRecovery?: boolean;
}): Promise<ReliabilityActionResult> {
  try {
    await (
      await getBoardCaller()
    ).reliability.updateAlertPolicy({
      id: input.id,
      expectedConfigRevision: input.expectedConfigRevision,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.warningThreshold !== undefined ? { warningThreshold: input.warningThreshold } : {}),
      ...(input.criticalThreshold !== undefined
        ? { criticalThreshold: input.criticalThreshold }
        : {}),
      ...(input.cooldownSeconds !== undefined ? { cooldownSeconds: input.cooldownSeconds } : {}),
      ...(input.notifyOnRecovery !== undefined ? { notifyOnRecovery: input.notifyOnRecovery } : {}),
    });
    revalidateReliabilityPaths(input.serviceKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function deleteAlertPolicyAction(input: {
  id: string;
  expectedConfigRevision: number;
  serviceKey: string;
}): Promise<ReliabilityActionResult> {
  try {
    await (
      await getBoardCaller()
    ).reliability.deleteAlertPolicy({
      id: input.id,
      expectedConfigRevision: input.expectedConfigRevision,
    });
    revalidateReliabilityPaths(input.serviceKey);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}
