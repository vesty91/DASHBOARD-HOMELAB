"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardSnapshot } from "@dashboard/boards";
import { BOARD_AUTOSAVE_DEBOUNCE_MS } from "@dashboard/boards";
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
import type {
  BeszelIntegrationOption,
  ImmichIntegrationOption,
  JellyfinIntegrationOption,
  PrometheusIntegrationOption,
  ServiceStatusCatalogOption,
  UptimeKumaIntegrationOption,
  GrafanaIntegrationOption,
  NtfyIntegrationOption,
  ProwlarrIntegrationOption,
  QbittorrentIntegrationOption,
  RadarrIntegrationOption,
  SonarrIntegrationOption,
  ProxmoxIntegrationOption,
} from "@dashboard/widgets/runtime";
import { useRouter } from "next/navigation";
import { BoardEditor } from "./board-editor";
import { BoardMetaForm } from "./board-meta-form";
import { saveLayoutAction, updateBoardAction } from "./actions";
import { createBoardMutationCoordinator } from "./mutation-coordinator";

export function BoardEditWorkspace({
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
        jellyfinViews={jellyfinViews}
        jellyfinIntegrations={jellyfinIntegrations}
        immichViews={immichViews}
        immichIntegrations={immichIntegrations}
        beszelViews={beszelViews}
        beszelIntegrations={beszelIntegrations}
        prometheusViews={prometheusViews}
        prometheusIntegrations={prometheusIntegrations}
        uptimeKumaViews={uptimeKumaViews}
        uptimeKumaIntegrations={uptimeKumaIntegrations}
        proxmoxViews={proxmoxViews}
        proxmoxIntegrations={proxmoxIntegrations}
        grafanaViews={grafanaViews}
        grafanaIntegrations={grafanaIntegrations}
        ntfyViews={ntfyViews}
        ntfyIntegrations={ntfyIntegrations}
        prowlarrViews={prowlarrViews}
        prowlarrIntegrations={prowlarrIntegrations}
        qbittorrentViews={qbittorrentViews}
        qbittorrentIntegrations={qbittorrentIntegrations}
        radarrViews={radarrViews}
        radarrIntegrations={radarrIntegrations}
        sonarrViews={sonarrViews}
        sonarrIntegrations={sonarrIntegrations}
        serviceStatusViews={serviceStatusViews}
        serviceStatusCatalog={serviceStatusCatalog}
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
