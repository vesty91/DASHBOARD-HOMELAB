import Link from "next/link";
import { getBoardCaller } from "../../../../lib/server/board-api";
import { BoardEditWorkspace } from "../../board-edit-workspace";
import { deleteBoardAction } from "../../actions";
import { DeleteBoardControl } from "../../delete-board-control";
import { resolveAppTileViews } from "../../resolve-app-tiles";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";

export default async function EditBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const caller = await getBoardCaller();
  let snapshot;
  try {
    snapshot = await caller.board.getForEdit({ slug });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect(`/login?callbackUrl=/boards/${slug}/edit`);
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      redirect("/forbidden");
    throw error;
  }
  const catalog = await caller.widget.catalog();
  const appViews = await resolveAppTileViews(snapshot, caller);
  let canReadApps = true;
  try {
    await caller.app.list({ limit: 1 });
  } catch (error) {
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED"))
      canReadApps = false;
    else throw error;
  }
  return (
    <main>
      <h1>Modifier {snapshot.board.name}</h1>
      <Link href={`/boards/${slug}`}>Quitter le mode édition</Link>
      <BoardEditWorkspace
        snapshot={snapshot}
        catalog={catalog}
        appViews={appViews}
        canReadApps={canReadApps}
      />
      <DeleteBoardControl action={deleteBoardAction.bind(null, snapshot.board.id)} />
    </main>
  );
}
