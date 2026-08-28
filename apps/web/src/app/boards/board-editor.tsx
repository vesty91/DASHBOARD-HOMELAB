"use client";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import type { AppTileView, WidgetCatalogEntry } from "@dashboard/widgets";
import {
  APP_TILE_UNSET_APP_ID,
  appTileDraftConfig,
  bookmarksDefaultConfig,
  clockDefaultConfig,
} from "@dashboard/widgets";
import { WidgetConfigForm, WidgetRenderer } from "@dashboard/widgets/runtime";
import { GridStack, type GridStackNode } from "gridstack";
import { useRouter } from "next/navigation";
import {
  createBoardItemAction,
  deleteBoardItemAction,
  listAppsForWidgetAction,
  updateBoardItemAction,
} from "./actions";
import type { createBoardMutationCoordinator } from "./mutation-coordinator";

function defaultConfig(widgetType: string): unknown {
  switch (widgetType) {
    case "clock":
      return clockDefaultConfig;
    case "bookmarks":
      return bookmarksDefaultConfig;
    case "app-tile":
      return appTileDraftConfig;
    default:
      return {};
  }
}

type BoardCoordinator = ReturnType<typeof createBoardMutationCoordinator>;

export function BoardEditor({
  snapshot,
  catalog,
  appViews,
  canReadApps,
  conflict,
  conflictRef,
  coordinator,
  setCurrent,
  setStatus,
  setMutationError,
}: {
  snapshot: BoardSnapshot;
  catalog: readonly WidgetCatalogEntry[];
  appViews: Record<string, AppTileView>;
  canReadApps: boolean;
  conflict: boolean;
  conflictRef: MutableRefObject<boolean>;
  coordinator: BoardCoordinator;
  setCurrent: Dispatch<SetStateAction<BoardSnapshot>>;
  setStatus: Dispatch<SetStateAction<string>>;
  setMutationError: Dispatch<SetStateAction<string | null>>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [breakpoint, setBreakpoint] = useState("desktop");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftConfig, setDraftConfig] = useState<unknown>(null);
  const [pendingAppTile, setPendingAppTile] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [gridEpoch, setGridEpoch] = useState(0);
  const router = useRouter();
  const current = snapshot;
  const active = current.layouts.find((layout) => layout.breakpoint === breakpoint)!;
  useEffect(() => {
    if (!root.current) return;
    const layoutId = active.id;
    const columns = active.columns;
    const rowHeight = active.rowHeight;
    const grid = GridStack.init(
      {
        column: columns,
        cellHeight: rowHeight,
        margin: 8,
        float: true,
      },
      root.current,
    )!;
    const persist = (_event: Event, nodes: GridStackNode[]) => {
      if (conflictRef.current) return;
      setStatus("Modifications en attente");
      coordinator.scheduleLayout({
        layoutId,
        items: nodes
          .filter((node) => node.el?.dataset.itemId)
          .map((node) => ({
            itemId: node.el!.dataset.itemId!,
            x: node.x ?? 0,
            y: node.y ?? 0,
            w: node.w ?? 1,
            h: node.h ?? 1,
          })),
      });
    };
    grid.on("change", persist);
    return () => {
      void coordinator.flushLayout();
      grid.destroy(false);
    };
  }, [
    active.id,
    active.columns,
    active.rowHeight,
    coordinator,
    conflictRef,
    gridEpoch,
    setStatus,
    snapshot.board.id,
  ]);

  const addWidget = async (widgetType: string, config: unknown) => {
    setMutationError(null);
    setStatus("Sauvegarde…");
    const result = await coordinator.runMutation(async (expectedRevision) =>
      createBoardItemAction({
        boardId: snapshot.board.id,
        expectedRevision,
        widgetType,
        config,
      }),
    );
    if (!result.ok) return;
    setCurrent(result.snapshot);
    setGridEpoch((value) => value + 1);
    setStatus("Sauvegardé");
    setCatalogOpen(false);
    setPendingAppTile(false);
    router.refresh();
  };

  const saveItem = async () => {
    if (!editingId) return;
    setMutationError(null);
    setStatus("Sauvegarde…");
    const result = await coordinator.runMutation(async (expectedRevision) =>
      updateBoardItemAction({
        boardId: snapshot.board.id,
        itemId: editingId,
        expectedRevision,
        title: draftTitle,
        config: draftConfig,
      }),
    );
    if (!result.ok) return;
    setCurrent((value) => ({
      ...value,
      board: { ...value.board, revision: result.revision },
      items: value.items.map((item) =>
        item.id === editingId ? { ...item, title: draftTitle || null, config: draftConfig } : item,
      ),
    }));
    setStatus("Sauvegardé");
    setEditingId(null);
    router.refresh();
  };

  const removeItem = async (itemId: string) => {
    setMutationError(null);
    setStatus("Sauvegarde…");
    const result = await coordinator.runMutation(async (expectedRevision) =>
      deleteBoardItemAction({
        boardId: snapshot.board.id,
        itemId,
        expectedRevision,
      }),
    );
    if (!result.ok) return;
    setCurrent((value) => ({
      ...value,
      board: { ...value.board, revision: result.revision },
      items: value.items.filter((item) => item.id !== itemId),
      placements: value.placements.filter((placement) => placement.itemId !== itemId),
    }));
    setGridEpoch((value) => value + 1);
    setStatus("Sauvegardé");
    setDeleteId(null);
    router.refresh();
  };

  const placements = current.placements.filter((placement) => placement.layoutId === active.id);
  const editing = current.items.find((item) => item.id === editingId);
  const isPublic = current.board.visibility === "public";
  const selectedAppId =
    typeof (draftConfig as { appId?: string } | null)?.appId === "string"
      ? (draftConfig as { appId: string }).appId
      : "";

  return (
    <section>
      <div className="board-edit-toolbar">
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
        <button type="button" onClick={() => setCatalogOpen((value) => !value)}>
          Ajouter un widget
        </button>
      </div>
      {catalogOpen && (
        <section aria-label="Catalogue de widgets">
          {pendingAppTile ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addWidget("app-tile", draftConfig ?? appTileDraftConfig);
              }}
            >
              <WidgetConfigForm
                widgetType="app-tile"
                config={draftConfig ?? appTileDraftConfig}
                onChange={setDraftConfig}
                permissionDenied={!canReadApps}
                loadApps={listAppsForWidgetAction}
              />
              <button
                type="submit"
                disabled={
                  !canReadApps ||
                  selectedAppId === APP_TILE_UNSET_APP_ID ||
                  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    selectedAppId,
                  )
                }
              >
                Ajouter la tuile
              </button>
              <button type="button" onClick={() => setPendingAppTile(false)}>
                Annuler
              </button>
            </form>
          ) : (
            <ul>
              {catalog.map((entry) => {
                const blocked = isPublic && !entry.publicSafe;
                return (
                  <li key={entry.id}>
                    <p>
                      <strong>{entry.name}</strong> — {entry.description}
                    </p>
                    <p>
                      {entry.category} · {entry.defaultSize.w}×{entry.defaultSize.h}
                    </p>
                    <button
                      type="button"
                      disabled={blocked || conflict}
                      {...(blocked
                        ? {
                            title:
                              "Ce widget n'est pas public-safe et ne peut pas être ajouté à un board public",
                          }
                        : {})}
                      onClick={() => {
                        if (entry.id === "app-tile") {
                          setDraftConfig(appTileDraftConfig);
                          setPendingAppTile(true);
                          return;
                        }
                        void addWidget(entry.id, defaultConfig(entry.id));
                      }}
                    >
                      Ajouter {entry.name}
                    </button>
                    {blocked ? (
                      <p>Refusé sur un board public : ce widget n'est pas public-safe.</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
      <div className="grid-stack board-editing" ref={root} key={`${active.id}-${gridEpoch}`}>
        {placements.map((placement) => {
          const entry = current.items.find((item) => item.id === placement.itemId);
          return (
            <div
              className="grid-stack-item"
              key={placement.id}
              data-item-id={placement.itemId}
              gs-x={placement.x}
              gs-y={placement.y}
              gs-w={placement.w}
              gs-h={placement.h}
              {...(placement.minW != null ? { "gs-min-w": placement.minW } : {})}
              {...(placement.minH != null ? { "gs-min-h": placement.minH } : {})}
              {...(placement.maxW != null ? { "gs-max-w": placement.maxW } : {})}
              {...(placement.maxH != null ? { "gs-max-h": placement.maxH } : {})}
            >
              <div
                className="grid-stack-item-content"
                tabIndex={0}
                aria-label={`Déplacer ou redimensionner ${entry?.title ?? entry?.widgetType ?? "item"}`}
              >
                {entry ? (
                  <WidgetRenderer
                    item={entry}
                    {...(appViews[entry.id] ? { appView: appViews[entry.id] } : {})}
                  />
                ) : null}
                <div className="widget-edit-controls">
                  <button
                    type="button"
                    onClick={() => {
                      if (!entry) return;
                      setEditingId(entry.id);
                      setDraftTitle(entry.title ?? "");
                      setDraftConfig(entry.config ?? defaultConfig(entry.widgetType));
                    }}
                  >
                    Configurer
                  </button>
                  <button type="button" onClick={() => setDeleteId(entry?.id ?? null)}>
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {editing && (
        <form
          aria-label="Configuration du widget"
          onSubmit={(event) => {
            event.preventDefault();
            void saveItem();
          }}
        >
          <h2>Configurer le widget</h2>
          <label>
            Titre du widget
            <input
              value={draftTitle}
              maxLength={120}
              onChange={(event) => setDraftTitle(event.target.value)}
            />
          </label>
          <WidgetConfigForm
            widgetType={editing.widgetType}
            config={draftConfig}
            onChange={setDraftConfig}
            permissionDenied={!canReadApps}
            loadApps={listAppsForWidgetAction}
          />
          <button type="submit">Enregistrer la configuration</button>
          <button type="button" onClick={() => setEditingId(null)}>
            Annuler
          </button>
        </form>
      )}
      {deleteId && (
        <section role="alertdialog" aria-labelledby="delete-widget-title" aria-modal="true">
          <h2 id="delete-widget-title">Supprimer ce widget ?</h2>
          <button type="button" onClick={() => setDeleteId(null)}>
            Annuler
          </button>
          <button type="button" onClick={() => void removeItem(deleteId)}>
            Supprimer définitivement
          </button>
        </section>
      )}
    </section>
  );
}
