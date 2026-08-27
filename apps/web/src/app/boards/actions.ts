"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import { getBoardCaller } from "../../lib/server/board-api";
import { toBoardMutationFailure, type BoardMutationResult } from "./mutation-result";

export async function createBoardAction(formData: FormData) {
  const board = await (
    await getBoardCaller()
  ).board.create({
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    description: String(formData.get("description") ?? ""),
    visibility: "private",
  });
  redirect(`/boards/${board.board.slug}/edit`);
}

export async function saveLayoutAction(input: {
  boardId: string;
  layoutId: string;
  expectedRevision: number;
  items: { itemId: string; x: number; y: number; w: number; h: number }[];
}): Promise<BoardMutationResult<{ revision: number }>> {
  try {
    const revision = await (await getBoardCaller()).board.layout.updateBatch(input);
    return { ok: true, revision };
  } catch (error) {
    return toBoardMutationFailure(error);
  }
}

export async function updateBoardAction(input: {
  boardId: string;
  expectedRevision: number;
  name: string;
  description: string;
  visibility: "private" | "authenticated" | "public";
}): Promise<BoardMutationResult<{ revision: number }>> {
  try {
    const revision = await (
      await getBoardCaller()
    ).board.update({
      boardId: input.boardId,
      expectedRevision: input.expectedRevision,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
    });
    revalidatePath("/boards");
    return { ok: true, revision };
  } catch (error) {
    return toBoardMutationFailure(error);
  }
}

export async function deleteBoardAction(boardId: string) {
  await (await getBoardCaller()).board.delete({ boardId });
  revalidatePath("/boards");
  redirect("/boards");
}

export async function createBoardItemAction(input: {
  boardId: string;
  expectedRevision: number;
  widgetType: string;
  title?: string | null;
  config: unknown;
}): Promise<BoardMutationResult<{ revision: number; snapshot: BoardSnapshot }>> {
  try {
    const result = await (await getBoardCaller()).board.item.create(input);
    revalidatePath("/boards");
    return { ok: true, ...result };
  } catch (error) {
    return toBoardMutationFailure(error);
  }
}

export async function updateBoardItemAction(input: {
  boardId: string;
  itemId: string;
  expectedRevision: number;
  title?: string | null;
  config?: unknown;
}): Promise<BoardMutationResult<{ revision: number }>> {
  try {
    const revision = await (await getBoardCaller()).board.item.update(input);
    revalidatePath("/boards");
    return { ok: true, revision };
  } catch (error) {
    return toBoardMutationFailure(error);
  }
}

export async function deleteBoardItemAction(input: {
  boardId: string;
  itemId: string;
  expectedRevision: number;
}): Promise<BoardMutationResult<{ revision: number }>> {
  try {
    const revision = await (await getBoardCaller()).board.item.delete(input);
    revalidatePath("/boards");
    return { ok: true, revision };
  } catch (error) {
    return toBoardMutationFailure(error);
  }
}

export async function listAppsForWidgetAction(cursor?: string) {
  try {
    return await (await getBoardCaller()).app.list({ limit: 50, cursor });
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED"))
      throw new Error("Permission insuffisante");
    throw error;
  }
}
