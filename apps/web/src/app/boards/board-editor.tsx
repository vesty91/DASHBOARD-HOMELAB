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
import type {
  AppTileView,
  BeszelHostsView,
  ImmichStatsView,
  JellyfinSessionsView,
  PrometheusMetricView,
  ServiceStatusView,
  UptimeKumaStatusView,
  GrafanaStatusView,
  NtfyStatusView,
  ProwlarrStatusView,
  QbittorrentTransferView,
  RadarrOverviewView,
  SonarrOverviewView,
  ProxmoxResourcesView,
  WidgetCatalogEntry,
} from "@dashboard/widgets";
import {
  APP_TILE_UNSET_APP_ID,
  appTileDraftConfig,
  beszelHostsDraftConfig,
  bookmarksDefaultConfig,
  clockDefaultConfig,
  immichStatsDraftConfig,
  jellyfinSessionsDraftConfig,
  prometheusMetricDraftConfig,
  serviceStatusDefaultConfig,
  uptimeKumaStatusDraftConfig,
  grafanaStatusDraftConfig,
  ntfyStatusDraftConfig,
  prowlarrStatusDraftConfig,
  qbittorrentTransferDraftConfig,
  radarrOverviewDraftConfig,
  sonarrOverviewDraftConfig,
  proxmoxResourcesDraftConfig,
} from "@dashboard/widgets";
import {
  WidgetConfigForm,
  WidgetRenderer,
  type BeszelIntegrationOption,
  type ImmichIntegrationOption,
  type JellyfinIntegrationOption,
  type PrometheusIntegrationOption,
  type ServiceStatusCatalogOption,
  type UptimeKumaIntegrationOption,
  type GrafanaIntegrationOption,
  type NtfyIntegrationOption,
  type ProwlarrIntegrationOption,
  type QbittorrentIntegrationOption,
  type RadarrIntegrationOption,
  type SonarrIntegrationOption,
  type ProxmoxIntegrationOption,
} from "@dashboard/widgets/runtime";
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
    case "jellyfin-sessions":
      return jellyfinSessionsDraftConfig;
    case "immich-stats":
      return immichStatsDraftConfig;
    case "beszel-hosts":
      return beszelHostsDraftConfig;
    case "prometheus-metric":
      return prometheusMetricDraftConfig;
    case "service-status":
      return serviceStatusDefaultConfig;
    case "uptime-kuma-status":
      return uptimeKumaStatusDraftConfig;
    case "grafana-status":
      return grafanaStatusDraftConfig;
    case "ntfy-status":
      return ntfyStatusDraftConfig;
    case "prowlarr-status":
      return prowlarrStatusDraftConfig;
    case "qbittorrent-transfer":
      return qbittorrentTransferDraftConfig;
    case "radarr-overview":
      return radarrOverviewDraftConfig;
    case "sonarr-overview":
      return sonarrOverviewDraftConfig;
    case "proxmox-resources":
      return proxmoxResourcesDraftConfig;
    default:
      return {};
  }
}

type BoardCoordinator = ReturnType<typeof createBoardMutationCoordinator>;

export function BoardEditor({
  snapshot,
  catalog,
  appViews,
  jellyfinViews = {},
  jellyfinIntegrations = [],
  immichViews = {},
  immichIntegrations = [],
  beszelViews = {},
  beszelIntegrations = [],
  prometheusViews = {},
  prometheusIntegrations = [],
  uptimeKumaViews = {},
  uptimeKumaIntegrations = [],
  proxmoxViews = {},
  proxmoxIntegrations = [],
  grafanaViews = {},
  grafanaIntegrations = [],
  ntfyViews = {},
  ntfyIntegrations = [],
  prowlarrViews = {},
  prowlarrIntegrations = [],
  qbittorrentViews = {},
  qbittorrentIntegrations = [],
  radarrViews = {},
  radarrIntegrations = [],
  sonarrViews = {},
  sonarrIntegrations = [],
  serviceStatusViews = {},
  serviceStatusCatalog = [],
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
  jellyfinViews?: Record<string, JellyfinSessionsView>;
  jellyfinIntegrations?: readonly JellyfinIntegrationOption[];
  immichViews?: Record<string, ImmichStatsView>;
  immichIntegrations?: readonly ImmichIntegrationOption[];
  beszelViews?: Record<string, BeszelHostsView>;
  beszelIntegrations?: readonly BeszelIntegrationOption[];
  prometheusViews?: Record<string, PrometheusMetricView>;
  prometheusIntegrations?: readonly PrometheusIntegrationOption[];
  uptimeKumaViews?: Record<string, UptimeKumaStatusView>;
  uptimeKumaIntegrations?: readonly UptimeKumaIntegrationOption[];
  proxmoxViews?: Record<string, ProxmoxResourcesView>;
  proxmoxIntegrations?: readonly ProxmoxIntegrationOption[];
  grafanaViews?: Record<string, GrafanaStatusView>;
  grafanaIntegrations?: readonly GrafanaIntegrationOption[];
  ntfyViews?: Record<string, NtfyStatusView>;
  ntfyIntegrations?: readonly NtfyIntegrationOption[];
  prowlarrViews?: Record<string, ProwlarrStatusView>;
  prowlarrIntegrations?: readonly ProwlarrIntegrationOption[];
  qbittorrentViews?: Record<string, QbittorrentTransferView>;
  qbittorrentIntegrations?: readonly QbittorrentIntegrationOption[];
  radarrViews?: Record<string, RadarrOverviewView>;
  radarrIntegrations?: readonly RadarrIntegrationOption[];
  sonarrViews?: Record<string, SonarrOverviewView>;
  sonarrIntegrations?: readonly SonarrIntegrationOption[];
  serviceStatusViews?: Record<string, ServiceStatusView>;
  serviceStatusCatalog?: readonly ServiceStatusCatalogOption[];
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
  const [pendingJellyfin, setPendingJellyfin] = useState(false);
  const [pendingImmich, setPendingImmich] = useState(false);
  const [pendingBeszel, setPendingBeszel] = useState(false);
  const [pendingPrometheus, setPendingPrometheus] = useState(false);
  const [pendingUptimeKuma, setPendingUptimeKuma] = useState(false);
  const [pendingProxmox, setPendingProxmox] = useState(false);
  const [pendingGrafana, setPendingGrafana] = useState(false);
  const [pendingNtfy, setPendingNtfy] = useState(false);
  const [pendingProwlarr, setPendingProwlarr] = useState(false);
  const [pendingQbittorrent, setPendingQbittorrent] = useState(false);
  const [pendingRadarr, setPendingRadarr] = useState(false);
  const [pendingSonarr, setPendingSonarr] = useState(false);
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
    setPendingJellyfin(false);
    setPendingImmich(false);
    setPendingBeszel(false);
    setPendingPrometheus(false);
    setPendingUptimeKuma(false);
    setPendingProxmox(false);
    setPendingGrafana(false);
    setPendingNtfy(false);
    setPendingProwlarr(false);
    setPendingQbittorrent(false);
    setPendingRadarr(false);
    setPendingSonarr(false);
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
  const pendingIntegration =
    pendingJellyfin ||
    pendingImmich ||
    pendingBeszel ||
    pendingPrometheus ||
    pendingUptimeKuma ||
    pendingProxmox ||
    pendingGrafana ||
    pendingNtfy ||
    pendingProwlarr ||
    pendingQbittorrent ||
    pendingRadarr ||
    pendingSonarr;
  const pendingWidgetType = pendingJellyfin
    ? "jellyfin-sessions"
    : pendingImmich
      ? "immich-stats"
      : pendingBeszel
        ? "beszel-hosts"
        : pendingPrometheus
          ? "prometheus-metric"
          : pendingUptimeKuma
            ? "uptime-kuma-status"
            : pendingProxmox
              ? "proxmox-resources"
              : pendingGrafana
                ? "grafana-status"
                : pendingNtfy
                  ? "ntfy-status"
                  : pendingProwlarr
                    ? "prowlarr-status"
                    : pendingQbittorrent
                      ? "qbittorrent-transfer"
                      : pendingRadarr
                        ? "radarr-overview"
                        : pendingSonarr
                          ? "sonarr-overview"
                          : "app-tile";
  const pendingDraftConfig = pendingJellyfin
    ? jellyfinSessionsDraftConfig
    : pendingImmich
      ? immichStatsDraftConfig
      : pendingBeszel
        ? beszelHostsDraftConfig
        : pendingPrometheus
          ? prometheusMetricDraftConfig
          : pendingUptimeKuma
            ? uptimeKumaStatusDraftConfig
            : pendingProxmox
              ? proxmoxResourcesDraftConfig
              : pendingGrafana
                ? grafanaStatusDraftConfig
                : pendingNtfy
                  ? ntfyStatusDraftConfig
                  : pendingProwlarr
                    ? prowlarrStatusDraftConfig
                    : pendingQbittorrent
                      ? qbittorrentTransferDraftConfig
                      : pendingRadarr
                        ? radarrOverviewDraftConfig
                        : pendingSonarr
                          ? sonarrOverviewDraftConfig
                          : appTileDraftConfig;
  const pendingPermissionDenied = pendingJellyfin
    ? jellyfinIntegrations.length === 0
    : pendingImmich
      ? immichIntegrations.length === 0
      : pendingBeszel
        ? beszelIntegrations.length === 0
        : pendingPrometheus
          ? prometheusIntegrations.length === 0
          : pendingUptimeKuma
            ? uptimeKumaIntegrations.length === 0
            : pendingProxmox
              ? proxmoxIntegrations.length === 0
              : pendingGrafana
                ? grafanaIntegrations.length === 0
                : pendingNtfy
                  ? ntfyIntegrations.length === 0
                  : pendingProwlarr
                    ? prowlarrIntegrations.length === 0
                    : pendingQbittorrent
                      ? qbittorrentIntegrations.length === 0
                      : pendingRadarr
                        ? radarrIntegrations.length === 0
                        : pendingSonarr
                          ? sonarrIntegrations.length === 0
                          : !canReadApps;

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
          {pendingAppTile || pendingIntegration ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addWidget(pendingWidgetType, draftConfig ?? pendingDraftConfig);
              }}
            >
              <WidgetConfigForm
                widgetType={pendingWidgetType}
                config={draftConfig ?? pendingDraftConfig}
                onChange={setDraftConfig}
                permissionDenied={pendingPermissionDenied}
                loadApps={listAppsForWidgetAction}
                jellyfinIntegrations={jellyfinIntegrations}
                immichIntegrations={immichIntegrations}
                beszelIntegrations={beszelIntegrations}
                prometheusIntegrations={prometheusIntegrations}
                serviceStatusCatalog={serviceStatusCatalog}
                uptimeKumaIntegrations={uptimeKumaIntegrations}
                proxmoxIntegrations={proxmoxIntegrations}
                grafanaIntegrations={grafanaIntegrations}
                ntfyIntegrations={ntfyIntegrations}
                prowlarrIntegrations={prowlarrIntegrations}
                qbittorrentIntegrations={qbittorrentIntegrations}
                radarrIntegrations={radarrIntegrations}
                sonarrIntegrations={sonarrIntegrations}
              />
              <button
                type="submit"
                disabled={
                  pendingIntegration
                    ? !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                        typeof (draftConfig as { integrationId?: unknown })?.integrationId ===
                          "string"
                          ? (draftConfig as { integrationId: string }).integrationId
                          : "",
                      )
                    : !canReadApps ||
                      selectedAppId === APP_TILE_UNSET_APP_ID ||
                      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                        selectedAppId,
                      )
                }
              >
                {pendingIntegration ? "Ajouter le widget" : "Ajouter la tuile"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingAppTile(false);
                  setPendingJellyfin(false);
                  setPendingImmich(false);
                  setPendingBeszel(false);
                  setPendingPrometheus(false);
                  setPendingUptimeKuma(false);
                  setPendingProxmox(false);
                  setPendingGrafana(false);
                  setPendingNtfy(false);
                  setPendingProwlarr(false);
                  setPendingQbittorrent(false);
                  setPendingRadarr(false);
                  setPendingSonarr(false);
                }}
              >
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
                        if (entry.id === "jellyfin-sessions") {
                          setDraftConfig(jellyfinSessionsDraftConfig);
                          setPendingJellyfin(true);
                          return;
                        }
                        if (entry.id === "immich-stats") {
                          setDraftConfig(immichStatsDraftConfig);
                          setPendingImmich(true);
                          return;
                        }
                        if (entry.id === "beszel-hosts") {
                          setDraftConfig(beszelHostsDraftConfig);
                          setPendingBeszel(true);
                          return;
                        }
                        if (entry.id === "prometheus-metric") {
                          setDraftConfig(prometheusMetricDraftConfig);
                          setPendingPrometheus(true);
                          return;
                        }
                        if (entry.id === "uptime-kuma-status") {
                          setDraftConfig(uptimeKumaStatusDraftConfig);
                          setPendingUptimeKuma(true);
                          return;
                        }
                        if (entry.id === "proxmox-resources") {
                          setDraftConfig(proxmoxResourcesDraftConfig);
                          setPendingProxmox(true);
                          return;
                        }
                        if (entry.id === "grafana-status") {
                          setDraftConfig(grafanaStatusDraftConfig);
                          setPendingGrafana(true);
                          return;
                        }
                        if (entry.id === "ntfy-status") {
                          setDraftConfig(ntfyStatusDraftConfig);
                          setPendingNtfy(true);
                          return;
                        }
                        if (entry.id === "prowlarr-status") {
                          setDraftConfig(prowlarrStatusDraftConfig);
                          setPendingProwlarr(true);
                          return;
                        }
                        if (entry.id === "qbittorrent-transfer") {
                          setDraftConfig(qbittorrentTransferDraftConfig);
                          setPendingQbittorrent(true);
                          return;
                        }
                        if (entry.id === "radarr-overview") {
                          setDraftConfig(radarrOverviewDraftConfig);
                          setPendingRadarr(true);
                          return;
                        }
                        if (entry.id === "sonarr-overview") {
                          setDraftConfig(sonarrOverviewDraftConfig);
                          setPendingSonarr(true);
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
                    {...(jellyfinViews[entry.id] ? { jellyfinView: jellyfinViews[entry.id] } : {})}
                    {...(immichViews[entry.id] ? { immichView: immichViews[entry.id] } : {})}
                    {...(beszelViews[entry.id] ? { beszelView: beszelViews[entry.id] } : {})}
                    {...(prometheusViews[entry.id]
                      ? { prometheusView: prometheusViews[entry.id] }
                      : {})}
                    {...(serviceStatusViews[entry.id]
                      ? { serviceStatusView: serviceStatusViews[entry.id] }
                      : {})}
                    {...(uptimeKumaViews[entry.id]
                      ? { uptimeKumaView: uptimeKumaViews[entry.id] }
                      : {})}
                    {...(proxmoxViews[entry.id] ? { proxmoxView: proxmoxViews[entry.id] } : {})}
                    {...(grafanaViews[entry.id] ? { grafanaView: grafanaViews[entry.id] } : {})}
                    {...(ntfyViews[entry.id] ? { ntfyView: ntfyViews[entry.id] } : {})}
                    {...(prowlarrViews[entry.id] ? { prowlarrView: prowlarrViews[entry.id] } : {})}
                    {...(qbittorrentViews[entry.id]
                      ? { qbittorrentView: qbittorrentViews[entry.id] }
                      : {})}
                    {...(radarrViews[entry.id] ? { radarrView: radarrViews[entry.id] } : {})}
                    {...(sonarrViews[entry.id] ? { sonarrView: sonarrViews[entry.id] } : {})}
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
            permissionDenied={!canReadApps && editing.widgetType === "app-tile"}
            loadApps={listAppsForWidgetAction}
            jellyfinIntegrations={jellyfinIntegrations}
            immichIntegrations={immichIntegrations}
            beszelIntegrations={beszelIntegrations}
            prometheusIntegrations={prometheusIntegrations}
            serviceStatusCatalog={serviceStatusCatalog}
            uptimeKumaIntegrations={uptimeKumaIntegrations}
            proxmoxIntegrations={proxmoxIntegrations}
            grafanaIntegrations={grafanaIntegrations}
            ntfyIntegrations={ntfyIntegrations}
            prowlarrIntegrations={prowlarrIntegrations}
            qbittorrentIntegrations={qbittorrentIntegrations}
            radarrIntegrations={radarrIntegrations}
            sonarrIntegrations={sonarrIntegrations}
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
