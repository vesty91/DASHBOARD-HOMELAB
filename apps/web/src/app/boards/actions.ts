"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { TRPCError } from "@trpc/server";
import { getBoardCaller } from "../../lib/server/board-api";

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
}) {
  return (await getBoardCaller()).board.layout.updateBatch(input);
}

export async function updateBoardAction(
  boardId: string,
  expectedRevision: number,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await (
      await getBoardCaller()
    ).board.update({
      boardId,
      expectedRevision,
      name: String(formData.get("name") ?? ""),
      description: String(formData.get("description") ?? ""),
      visibility: String(formData.get("visibility") ?? "private") as
        "private" | "authenticated" | "public",
    });
    revalidatePath("/boards");
    return {};
  } catch (error) {
    if (error instanceof TRPCError) return { error: error.message };
    throw error;
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
}) {
  const result = await (await getBoardCaller()).board.item.create(input);
  revalidatePath("/boards");
  return result;
}

export async function updateBoardItemAction(input: {
  boardId: string;
  itemId: string;
  expectedRevision: number;
  title?: string | null;
  config?: unknown;
}) {
  const revision = await (await getBoardCaller()).board.item.update(input);
  revalidatePath("/boards");
  return revision;
}

export async function deleteBoardItemAction(input: {
  boardId: string;
  itemId: string;
  expectedRevision: number;
}) {
  const revision = await (await getBoardCaller()).board.item.delete(input);
  revalidatePath("/boards");
  return revision;
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
