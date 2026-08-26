import Link from "next/link";
import { getBoardCaller } from "../../lib/server/board-api";
import { createBoardAction } from "./actions";

export default async function BoardsPage() {
  const caller = await getBoardCaller();
  const [boards, canCreate] = await Promise.all([caller.board.list(), caller.board.canCreate()]);
  return (
    <main>
      <h1>Boards</h1>
      <section aria-labelledby="accessible-boards">
        <h2 id="accessible-boards">Boards accessibles</h2>
        {boards.length === 0 ? (
          <p>Aucun board accessible.</p>
        ) : (
          <ul>
            {boards.map((board) => (
              <li key={board.id}>
                <Link href={`/boards/${board.slug}`}>{board.name}</Link>{" "}
                <Link href={`/boards/${board.slug}/edit`}>Modifier</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {canCreate && (
        <section aria-labelledby="create-board">
          <h2 id="create-board">Créer un board</h2>
          <form action={createBoardAction}>
            <label>
              Nom <input name="name" required maxLength={120} />
            </label>
            <label>
              Slug <input name="slug" required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
            </label>
            <label>
              Description <textarea name="description" maxLength={1000} />
            </label>
            <button type="submit">Créer</button>
          </form>
        </section>
      )}
    </main>
  );
}
