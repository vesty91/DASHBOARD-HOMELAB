import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
import { getBoardCaller } from "../../../lib/server/board-api";
import { ResponsiveBoardReadGrid } from "../responsive-board-read-grid";

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let snapshot;
  try {
    snapshot = await (await getBoardCaller()).board.get({ slug });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect(`/login?callbackUrl=/boards/${slug}`);
    if (error instanceof TRPCError && error.code === "FORBIDDEN") redirect("/forbidden");
    throw error;
  }
  return (
    <main>
      <h1>{snapshot.board.name}</h1>
      {snapshot.board.description && <p>{snapshot.board.description}</p>}
      <Link href={`/boards/${slug}/edit`}>Modifier</Link>
      <ResponsiveBoardReadGrid snapshot={snapshot} />
    </main>
  );
}
