"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
) {
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
}

export async function deleteBoardAction(boardId: string) {
  await (await getBoardCaller()).board.delete({ boardId });
  revalidatePath("/boards");
  redirect("/boards");
}
