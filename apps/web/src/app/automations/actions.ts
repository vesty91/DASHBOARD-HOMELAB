"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import type {
  AutomationActionType,
  AutomationDryRunResult,
  AutomationRuleCreateInput,
  AutomationRuleUpdateInput,
  AutomationTriggerType,
} from "@dashboard/automations";
import { getAuthOptions } from "@/lib/server/auth";
import { getBoardCaller } from "@/lib/server/board-api";

export type AutomationActionResult = { ok: true } | { ok: false; code: string; message: string };

export type AutomationDryRunActionResult =
  { ok: true; result: AutomationDryRunResult } | { ok: false; code: string; message: string };

export type AutomationManualRunActionResult =
  | {
      ok: true;
      result: {
        runId: string;
        status: string;
        errorCode: string | null;
        resourceId: string | null;
      };
    }
  | { ok: false; code: string; message: string };

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

async function requireOwnerUserId(): Promise<string> {
  const session = await getServerSession(await getAuthOptions());
  const userId = session?.user?.id;
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
  return userId;
}

export async function createAutomationAction(input: {
  name: string;
  description: string | null;
  triggerType: AutomationTriggerType;
  triggerConfigJson: Record<string, unknown>;
  conditionConfigJson: Record<string, unknown> | null;
  actionType: AutomationActionType;
  actionConfigJson: Record<string, unknown>;
  cooldownSeconds: number;
}): Promise<{ ok: true; id: string } | { ok: false; code: string; message: string }> {
  try {
    const caller = await getBoardCaller();
    const ownerUserId = await requireOwnerUserId();
    const payload: AutomationRuleCreateInput = {
      name: input.name,
      description: input.description,
      ownerUserId,
      triggerType: input.triggerType,
      triggerConfigJson: input.triggerConfigJson,
      conditionConfigJson: input.conditionConfigJson,
      actionType: input.actionType,
      actionConfigJson: input.actionConfigJson,
      cooldownSeconds: input.cooldownSeconds,
    };
    const created = await caller.automation.create(payload);
    revalidatePath("/automations");
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function updateAutomationAction(
  id: string,
  patch: AutomationRuleUpdateInput,
): Promise<AutomationActionResult> {
  try {
    await (await getBoardCaller()).automation.update({ id, patch });
    revalidatePath("/automations");
    revalidatePath(`/automations/${id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function setAutomationEnabledAction(input: {
  id: string;
  enabled: boolean;
  expectedConfigRevision: number;
}): Promise<AutomationActionResult> {
  try {
    await (await getBoardCaller()).automation.setEnabled(input);
    revalidatePath("/automations");
    revalidatePath(`/automations/${input.id}`);
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function deleteAutomationAction(id: string): Promise<AutomationActionResult> {
  try {
    await (await getBoardCaller()).automation.delete({ id });
    revalidatePath("/automations");
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function dryRunAutomationAction(id: string): Promise<AutomationDryRunActionResult> {
  try {
    const result = await (await getBoardCaller()).automation.dryRun({ id });
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function manualRunAutomationAction(
  id: string,
): Promise<AutomationManualRunActionResult> {
  try {
    const result = await (await getBoardCaller()).automation.manualRun({ id });
    revalidatePath(`/automations/${id}`);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}
