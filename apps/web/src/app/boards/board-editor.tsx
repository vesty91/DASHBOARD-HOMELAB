"use client";
import { useEffect, useRef, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import { BOARD_AUTOSAVE_DEBOUNCE_MS } from "@dashboard/boards";
import { GridStack, type GridStackNode } from "gridstack";
import { saveLayoutAction } from "./actions";

export function BoardEditor({ snapshot }: { snapshot: BoardSnapshot }) {
  const root = useRef<HTMLDivElement>(null);
  const revision = useRef(snapshot.board.revision);
  const queue = useRef(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{
    layoutId: string;
    items: { itemId: string; x: number; y: number; w: number; h: number }[];
  } | null>(null);
  const conflictRef = useRef(false);
  const [breakpoint, setBreakpoint] = useState("desktop");
  const [status, setStatus] = useState("Sauvegardé");
  const [conflict, setConflict] = useState(false);
  const active = snapshot.layouts.find((l) => l.breakpoint === breakpoint)!;
  const flushPending = () => {
    if (!pending.current || conflictRef.current) return;
    const save = pending.current;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setStatus("Sauvegarde…");
    queue.current = queue.current.then(async () => {
      if (conflictRef.current) return;
      try {
        revision.current = await saveLayoutAction({
          boardId: snapshot.board.id,
          layoutId: save.layoutId,
          expectedRevision: revision.current,
          items: save.items,
        });
        setStatus("Sauvegardé");
      } catch {
        conflictRef.current = true;
        pending.current = null;
        setConflict(true);
        setStatus("Le board a été modifié ailleurs.");
      }
    });
  };
  useEffect(() => {
    if (!root.current) return;
    const grid = GridStack.init(
      {
        column: active.columns,
        cellHeight: active.rowHeight,
        margin: 8,
        float: true,
      },
      root.current,
    )!;
    const persist = (_event: Event, nodes: GridStackNode[]) => {
      if (conflictRef.current) return;
      setStatus("Modifications en attente");
      if (timer.current) clearTimeout(timer.current);
      pending.current = {
        layoutId: active.id,
        items: nodes
          .filter((n) => n.el?.dataset.itemId)
          .map((n) => ({
            itemId: n.el!.dataset.itemId!,
            x: n.x ?? 0,
            y: n.y ?? 0,
            w: n.w ?? 1,
            h: n.h ?? 1,
          })),
      };
      timer.current = setTimeout(flushPending, BOARD_AUTOSAVE_DEBOUNCE_MS);
    };
    grid.on("change", persist);
    return () => {
      flushPending();
      grid.destroy(false);
    };
  }, [active, snapshot.board.id]);
  const placements = snapshot.placements.filter((p) => p.layoutId === active.id);
  return (
    <section>
      <nav aria-label="Layouts">
        <button
          type="button"
          onClick={() => setBreakpoint("desktop")}
          aria-pressed={breakpoint === "desktop"}
        >
          Desktop
        </button>
        <button
          type="button"
          onClick={() => setBreakpoint("mobile")}
          aria-pressed={breakpoint === "mobile"}
        >
          Mobile
        </button>
      </nav>
      <p role="status">{status}</p>
      {conflict && (
        <button type="button" onClick={() => location.reload()}>
          Recharger le board
        </button>
      )}
      <div className="grid-stack" ref={root}>
        {placements.map((p) => {
          const entry = snapshot.items.find((i) => i.id === p.itemId);
          return (
            <div
              className="grid-stack-item"
              key={p.id}
              data-item-id={p.itemId}
              gs-x={p.x}
              gs-y={p.y}
              gs-w={p.w}
              gs-h={p.h}
            >
              <article
                className="grid-stack-item-content"
                tabIndex={0}
                aria-label={`Déplacer ou redimensionner ${entry?.title ?? entry?.widgetType ?? "item"}`}
              >
                <h2>{entry?.title ?? entry?.widgetType}</h2>
                <p>{entry?.widgetType}</p>
              </article>
            </div>
          );
        })}
      </div>
    </section>
  );
}
