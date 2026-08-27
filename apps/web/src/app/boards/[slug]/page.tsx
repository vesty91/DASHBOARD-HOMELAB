import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../lib/server/auth";
import { getBoardCaller } from "../../../lib/server/board-api";
import { resolveAppTileViews } from "../resolve-app-tiles";
import { ResponsiveBoardReadGrid } from "../responsive-board-read-grid";

export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const caller = await getBoardCaller();
  let snapshot;
  try {
    snapshot = await caller.board.get({ slug });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "NOT_FOUND") notFound();
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect(`/login?callbackUrl=/boards/${slug}`);
    if (error instanceof TRPCError && error.code === "FORBIDDEN") redirect("/forbidden");
    throw error;
  }
  const session = await getServerSession(authOptions);
  const appViews = await resolveAppTileViews(snapshot, caller);
  return (
    <main>
      <h1>{snapshot.board.name}</h1>
      {snapshot.board.description && <p>{snapshot.board.description}</p>}
      {session?.user?.id ? <Link href={`/boards/${slug}/edit`}>Modifier</Link> : null}
      <ResponsiveBoardReadGrid snapshot={snapshot} appViews={appViews} />
    </main>
  );
}
