"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import { BOARD_AUTOSAVE_DEBOUNCE_MS } from "@dashboard/boards";
import type { AppTileView, WidgetCatalogEntry } from "@dashboard/widgets";
import {
  appTileDefaultConfig,
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
  saveLayoutAction,
  updateBoardItemAction,
} from "./actions";
import { createBoardMutationCoordinator } from "./mutation-coordinator";

function defaultConfig(widgetType: string): unknown {
  switch (widgetType) {
    case "clock":
      return clockDefaultConfig;
    case "bookmarks":
      return bookmarksDefaultConfig;
    case "app-tile":
      return appTileDefaultConfig;
    default:
      return {};
  }
}

export function BoardEditor({
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
  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(snapshot);
  const [breakpoint, setBreakpoint] = useState("desktop");
  const [status, setStatus] = useState("Sauvegardé");
  const [conflict, setConflict] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftConfig, setDraftConfig] = useState<unknown>(null);
  const [pendingAppTile, setPendingAppTile] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [gridEpoch, setGridEpoch] = useState(0);
  const router = useRouter();
  const conflictRef = useRef(false);
  const coordinator = useMemo(
    () =>
      createBoardMutationCoordinator({
        initialRevision: snapshot.board.revision,
        debounceMs: BOARD_AUTOSAVE_DEBOUNCE_MS,
        saveLayout: async (input) => {
          setStatus("Sauvegarde…");
          const revision = await saveLayoutAction({
            boardId: snapshot.board.id,
            ...input,
          });
          setStatus("Sauvegardé");
          return revision;
        },
        onConflict: () => {
          conflictRef.current = true;
          setConflict(true);
          setStatus("Le board a été modifié ailleurs.");
        },
      }),
    [snapshot.board.id],
  );
  const active = current.layouts.find((layout) => layout.breakpoint === breakpoint)!;
  useEffect(() => {
    setCurrent(snapshot);
  }, [snapshot]);
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
      coordinator.scheduleLayout({
        layoutId: active.id,
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
  }, [active, coordinator, gridEpoch, snapshot.board.id]);

  const addWidget = async (widgetType: string, config: unknown) => {
    setStatus("Sauvegarde…");
    await coordinator.runItemMutation(async (expectedRevision) => {
      const result = await createBoardItemAction({
        boardId: snapshot.board.id,
        expectedRevision,
        widgetType,
        config,
      });
      setCurrent(result.snapshot);
      setGridEpoch((value) => value + 1);
      setStatus("Sauvegardé");
      router.refresh();
      return result.revision;
    });
    setCatalogOpen(false);
    setPendingAppTile(false);
  };

  const saveItem = async () => {
    if (!editingId) return;
    setStatus("Sauvegarde…");
    await coordinator.runItemMutation(async (expectedRevision) => {
      const revision = await updateBoardItemAction({
        boardId: snapshot.board.id,
        itemId: editingId,
        expectedRevision,
        title: draftTitle,
        config: draftConfig,
      });
      setCurrent((value) => ({
        ...value,
        board: { ...value.board, revision },
        items: value.items.map((item) =>
          item.id === editingId
            ? { ...item, title: draftTitle || null, config: draftConfig }
            : item,
        ),
      }));
      setStatus("Sauvegardé");
      router.refresh();
      return revision;
    });
    setEditingId(null);
  };

  const removeItem = async (itemId: string) => {
    setStatus("Sauvegarde…");
    await coordinator.runItemMutation(async (expectedRevision) => {
      const revision = await deleteBoardItemAction({
        boardId: snapshot.board.id,
        itemId,
        expectedRevision,
      });
      setCurrent((value) => ({
        ...value,
        board: { ...value.board, revision },
        items: value.items.filter((item) => item.id !== itemId),
        placements: value.placements.filter((placement) => placement.itemId !== itemId),
      }));
      setGridEpoch((value) => value + 1);
      setStatus("Sauvegardé");
      router.refresh();
      return revision;
    });
    setDeleteId(null);
  };

  const placements = current.placements.filter((placement) => placement.layoutId === active.id);
  const editing = current.items.find((item) => item.id === editingId);
  const isPublic = current.board.visibility === "public";

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
      <button type="button" onClick={() => setCatalogOpen((value) => !value)}>
        Ajouter un widget
      </button>
      {catalogOpen && (
        <section aria-label="Catalogue de widgets">
          {pendingAppTile ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addWidget("app-tile", draftConfig ?? appTileDefaultConfig);
              }}
            >
              <WidgetConfigForm
                widgetType="app-tile"
                config={draftConfig ?? appTileDefaultConfig}
                onChange={setDraftConfig}
                permissionDenied={!canReadApps}
                loadApps={listAppsForWidgetAction}
              />
              <button
                type="submit"
                disabled={
                  !canReadApps ||
                  typeof (draftConfig as { appId?: string } | null)?.appId !== "string" ||
                  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                    (draftConfig as { appId: string }).appId,
                  ) ||
                  (draftConfig as { appId: string }).appId === appTileDefaultConfig.appId
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
                          setDraftConfig(appTileDefaultConfig);
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
      <div className="grid-stack" ref={root} key={`${active.id}-${gridEpoch}`}>
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
