"use server";

import { TRPCError } from "@trpc/server";
import { revalidatePath } from "next/cache";
import { getBoardCaller } from "@/lib/server/board-api";

export type TopologyActionResult =
  { ok: true; id?: string } | { ok: false; code: string; message: string };

function mapError(error: unknown): { code: string; message: string } {
  if (error instanceof TRPCError) {
    const code = error.code;
    let message = error.message || "Action impossible.";
    if (code === "CONFLICT") message = "Cette dépendance existe déjà.";
    if (code === "BAD_REQUEST" && /cycle/i.test(error.message)) {
      message = "Cette dépendance créerait un cycle. Les cycles sont refusés.";
    }
    if (code === "NOT_FOUND") message = "Service ou dépendance introuvable.";
    if (code === "FORBIDDEN") message = "Permission refusée.";
    return { code, message };
  }
  if (error instanceof Error) {
    if (/CYCLE/i.test(error.message) || /cycle/i.test(error.message)) {
      return {
        code: "BAD_REQUEST",
        message: "Cette dépendance créerait un cycle. Les cycles sont refusés.",
      };
    }
    return { code: "INTERNAL_ERROR", message: error.message };
  }
  return { code: "INTERNAL_ERROR", message: "Action impossible." };
}

function revalidateTopology() {
  revalidatePath("/topology");
}

export async function createDependencyAction(input: {
  upstreamServiceKey: string;
  downstreamServiceKey: string;
}): Promise<TopologyActionResult> {
  try {
    const created = await (
      await getBoardCaller()
    ).topology.create({
      upstreamServiceKey: input.upstreamServiceKey,
      downstreamServiceKey: input.downstreamServiceKey,
      relationship: "depends_on",
    });
    revalidateTopology();
    return { ok: true, id: created.id };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}

export async function deleteDependencyAction(id: string): Promise<TopologyActionResult> {
  try {
    await (await getBoardCaller()).topology.delete({ id });
    revalidateTopology();
    return { ok: true };
  } catch (error) {
    return { ok: false, ...mapError(error) };
  }
}
