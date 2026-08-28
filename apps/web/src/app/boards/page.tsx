import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardFooter,
  EmptyState,
  PageContainer,
  PageHeader,
} from "@dashboard/ui";
import { getBoardCaller } from "../../lib/server/board-api";
import { CreateBoardDialog } from "./create-board-dialog";

const visibilityLabel = {
  private: "Privé",
  authenticated: "Authentifié",
  public: "Public",
} as const;

const visibilityTone = {
  private: "neutral",
  authenticated: "accent",
  public: "success",
} as const;

export default async function BoardsPage() {
  const caller = await getBoardCaller();
  const [boards, canCreate] = await Promise.all([caller.board.list(), caller.board.canCreate()]);
  return (
    <PageContainer>
      <PageHeader
        title="Boards"
        description="Vos espaces et tableaux de bord."
        {...(canCreate ? { actions: <CreateBoardDialog /> } : {})}
      />
      {boards.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid />}
          title="Aucun board"
          description="Aucun board accessible."
        />
      ) : (
        <section className="card-grid" aria-labelledby="accessible-boards">
          <h2 id="accessible-boards" className="sr-only">
            Boards accessibles
          </h2>
          {boards.map((board) => {
            const canEdit = board.access.canEdit;
            return (
              <Card key={board.id} className="entity-card">
                <CardBody>
                  <div className="ui-card-header" style={{ padding: 0 }}>
                    <h2 className="ui-card-title">{board.name}</h2>
                    <Badge tone={visibilityTone[board.visibility]}>
                      {visibilityLabel[board.visibility]}
                    </Badge>
                  </div>
                  {board.description ? (
                    <p className="ui-muted line-clamp-2">{board.description}</p>
                  ) : null}
                </CardBody>
                <CardFooter>
                  <Link className="ui-btn" href={`/boards/${board.slug}`}>
                    Ouvrir
                  </Link>
                  {canEdit ? (
                    <Link className="ui-btn ui-btn-ghost" href={`/boards/${board.slug}/edit`}>
                      Modifier
                    </Link>
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </section>
      )}
    </PageContainer>
  );
}
