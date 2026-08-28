"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import { BOARD_AUTOSAVE_DEBOUNCE_MS } from "@dashboard/boards";
import type { AppTileView, WidgetCatalogEntry } from "@dashboard/widgets";
import { useRouter } from "next/navigation";
import { BoardEditor } from "./board-editor";
import { BoardMetaForm } from "./board-meta-form";
import { saveLayoutAction, updateBoardAction } from "./actions";
import { createBoardMutationCoordinator } from "./mutation-coordinator";

export function BoardEditWorkspace({
  snapshot,
  catalog,
  appViews,
  canReadApps,
}: {
  snapshot: BoardSnapshot;
  catalog: readonly WidgetCatalogEntry[];
  appViews: Record<string, AppTileView>;
  canReadApps: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(snapshot);
  const [status, setStatus] = useState("Sauvegardé");
  const [conflict, setConflict] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const conflictRef = useRef(false);
  const coordinator = useMemo(
    () =>
      createBoardMutationCoordinator({
        initialRevision: snapshot.board.revision,
        debounceMs: BOARD_AUTOSAVE_DEBOUNCE_MS,
        saveLayout: async (input) => {
          setStatus("Sauvegarde…");
          const result = await saveLayoutAction({
            boardId: snapshot.board.id,
            ...input,
          });
          if (result.ok) setStatus("Sauvegardé");
          return result;
        },
        onConflict: () => {
          conflictRef.current = true;
          setConflict(true);
          setMutationError(null);
          setStatus("Le board a été modifié ailleurs.");
        },
        onError: (failure) => {
          setMutationError(failure.message);
          setStatus("Sauvegarde refusée");
        },
      }),
    [snapshot.board.id],
  );
  useEffect(() => {
    setCurrent((value) => {
      if (snapshot.board.id !== value.board.id) return snapshot;
      if (snapshot.board.revision > value.board.revision) return snapshot;
      return value;
    });
  }, [snapshot]);

  return (
    <section>
      <div className="board-edit-toolbar">
        <p className="board-edit-status" role="status">
          {status}
        </p>
        {conflict ? (
          <button type="button" onClick={() => location.reload()}>
            Recharger le board
          </button>
        ) : null}
      </div>
      {mutationError && !conflict ? <p role="alert">{mutationError}</p> : null}
      <BoardMetaForm
        key={`${current.board.name}:${current.board.visibility}:${current.board.revision}`}
        name={current.board.name}
        description={current.board.description ?? ""}
        visibility={current.board.visibility}
        conflict={conflict}
        onSave={async (fields) => {
          setMutationError(null);
          setStatus("Sauvegarde…");
          const result = await coordinator.runMutation(async (expectedRevision) =>
            updateBoardAction({
              boardId: snapshot.board.id,
              expectedRevision,
              ...fields,
            }),
          );
          if (result.ok) {
            setCurrent((value) => ({
              ...value,
              board: {
                ...value.board,
                name: fields.name,
                description: fields.description,
                visibility: fields.visibility,
                revision: result.revision,
              },
            }));
            setStatus("Sauvegardé");
            router.refresh();
          }
          return result;
        }}
      />
      <BoardEditor
        snapshot={current}
        catalog={catalog}
        appViews={appViews}
        canReadApps={canReadApps}
        conflict={conflict}
        conflictRef={conflictRef}
        coordinator={coordinator}
        setCurrent={setCurrent}
        setStatus={setStatus}
        setMutationError={setMutationError}
      />
    </section>
  );
}
