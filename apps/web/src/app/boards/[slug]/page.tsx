import Link from "next/link";
import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { Badge, PageContainer, PageHeader } from "@dashboard/ui";
import { canAccessBoard } from "@dashboard/boards";
import { authOptions } from "../../../lib/server/auth";
import { createBoardApiContext, getBoardCaller } from "../../../lib/server/board-api";
import { resolveAppTileViews } from "../resolve-app-tiles";
import { ResponsiveBoardReadGrid } from "../responsive-board-read-grid";

const visibilityLabel = {
  private: "Privé",
  authenticated: "Authentifié",
  public: "Public",
} as const;

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
  const context = await createBoardApiContext();
  const canEdit = canAccessBoard(
    { board: snapshot.board, actor: context.actor, resourcePermissions: [] },
    "board.edit",
  );
  const appViews = await resolveAppTileViews(snapshot, caller);
  return (
    <PageContainer wide>
      <PageHeader
        title={snapshot.board.name}
        {...(snapshot.board.description ? { description: snapshot.board.description } : {})}
        actions={
          <>
            <Badge>{visibilityLabel[snapshot.board.visibility]}</Badge>
            {session?.user?.id && canEdit ? (
              <Link className="ui-btn ui-btn-primary" href={`/boards/${slug}/edit`}>
                Modifier
              </Link>
            ) : null}
          </>
        }
      />
      <ResponsiveBoardReadGrid snapshot={snapshot} appViews={appViews} />
    </PageContainer>
  );
}
