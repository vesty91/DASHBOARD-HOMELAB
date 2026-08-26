import Link from "next/link";
import { getBoardCaller } from "../../../../lib/server/board-api";
import { BoardEditor } from "../../board-editor";
import { deleteBoardAction, updateBoardAction } from "../../actions";
import { DeleteBoardControl } from "../../delete-board-control";
import { TRPCError } from "@trpc/server";
import { redirect } from "next/navigation";
export default async function EditBoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let snapshot;
  try {
    snapshot = await (await getBoardCaller()).board.getForEdit({ slug });
  } catch (error) {
    if (error instanceof TRPCError && error.code === "UNAUTHORIZED")
      redirect(`/login?callbackUrl=/boards/${slug}/edit`);
    if (error instanceof TRPCError && (error.code === "FORBIDDEN" || error.code === "NOT_FOUND"))
      redirect("/forbidden");
    throw error;
  }
  return (
    <main>
      <h1>Modifier {snapshot.board.name}</h1>
      <Link href={`/boards/${slug}`}>Quitter le mode édition</Link>
      <form action={updateBoardAction.bind(null, snapshot.board.id, snapshot.board.revision)}>
        <label>
          Nom <input name="name" defaultValue={snapshot.board.name} required maxLength={120} />
        </label>
        <label>
          Description{" "}
          <textarea
            name="description"
            defaultValue={snapshot.board.description ?? ""}
            maxLength={1000}
          />
        </label>
        <label>
          Visibilité{" "}
          <select name="visibility" defaultValue={snapshot.board.visibility}>
            <option value="private">Privé</option>
            <option value="authenticated">Authentifié</option>
            <option value="public">Public</option>
          </select>
        </label>
        <button type="submit">Enregistrer les métadonnées</button>
      </form>
      <BoardEditor snapshot={snapshot} />
      <DeleteBoardControl action={deleteBoardAction.bind(null, snapshot.board.id)} />
    </main>
  );
}
