/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WidgetRenderer } from "./widget-renderer";

vi.mock("./clock-widget", () => ({
  ClockWidget: () => <p>Horloge rendue</p>,
}));

afterEach(() => cleanup());

describe("widget renderer app tile isolation", () => {
  it("keeps Clock visible when an adjacent App Tile resolution is in error", () => {
    render(
      <div>
        <WidgetRenderer
          item={{
            id: "clock-1",
            widgetType: "clock",
            widgetVersion: 1,
            title: "Horloge",
            config: { timezone: "UTC", showDate: true, showSeconds: false, hour12: false },
            runtimeStatus: "ready",
          }}
        />
        <WidgetRenderer
          item={{
            id: "tile-1",
            widgetType: "app-tile",
            widgetVersion: 1,
            title: "Tuile",
            config: {
              appId: "22222222-2222-4222-8222-222222222222",
              showStatus: true,
              showLatency: false,
            },
            runtimeStatus: "ready",
          }}
          appView={{ status: "error" }}
        />
      </div>,
    );
    expect(screen.getByText("Horloge rendue")).toBeTruthy();
    expect(screen.getByText("Ce widget a rencontré une erreur")).toBeTruthy();
    expect(screen.queryByText("Error")).toBeNull();
    expect(screen.queryByText(/stack/i)).toBeNull();
  });

  it("renders an Uptime Kuma status widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "uptime-1",
          widgetType: "uptime-kuma-status",
          widgetVersion: 1,
          title: "Uptime",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        uptimeKumaView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-13T00:00:00.000Z",
          monitorCount: 2,
          upCount: 2,
          downCount: 0,
          pendingCount: 0,
          maintenanceCount: 0,
          truncated: false,
          latencyMs: 15,
        }}
      />,
    );
    expect(screen.getByText("2 / 2 en ligne")).toBeTruthy();
    expect(screen.getByText("Latence 15 ms")).toBeTruthy();
  });

  it("renders a Proxmox resources widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "pve-1",
          widgetType: "proxmox-resources",
          widgetVersion: 1,
          title: "Proxmox",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        proxmoxView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-14T00:00:00.000Z",
          nodeCount: 1,
          onlineNodeCount: 1,
          vmRunning: 2,
          vmCount: 3,
          lxcRunning: 1,
          lxcCount: 1,
          cpuRatio: 0.25,
          memoryUsedBytes: 4_294_967_296,
          memoryTotalBytes: 17_179_869_184,
          truncated: false,
        }}
      />,
    );
    expect(screen.getByText("1 / 1 nœuds en ligne")).toBeTruthy();
    expect(screen.getByText("2/3 VM · 1/1 CT")).toBeTruthy();
    expect(screen.getByText("CPU 25 %")).toBeTruthy();
  });

  it("renders a Grafana status widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "gf-1",
          widgetType: "grafana-status",
          widgetVersion: 1,
          title: "Grafana",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        grafanaView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-15T00:00:00.000Z",
          version: "11.2.0",
          database: "ok",
          dashboardCount: 12,
          alertsFiring: 2,
          alertsPending: 1,
        }}
      />,
    );
    expect(screen.getByText("Santé OK · 11.2.0")).toBeTruthy();
    expect(screen.getByText("12 tableaux de bord")).toBeTruthy();
    expect(screen.getByText("Alertes 2 firing · 1 pending")).toBeTruthy();
  });

  it("renders an ntfy status widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "ntfy-1",
          widgetType: "ntfy-status",
          widgetVersion: 1,
          title: "ntfy",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        ntfyView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-15T00:00:00.000Z",
          healthy: true,
          version: "2.11.0",
          messages: 12,
          messagesRate: 0.5,
        }}
      />,
    );
    expect(screen.getByText("Santé OK · 2.11.0")).toBeTruthy();
    expect(screen.getByText("12 messages")).toBeTruthy();
    expect(screen.getByText("Débit 0.5 msg/s")).toBeTruthy();
  });

  it("renders a Prowlarr status widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "prowlarr-1",
          widgetType: "prowlarr-status",
          widgetVersion: 1,
          title: "Prowlarr",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        prowlarrView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-15T00:00:00.000Z",
          version: "1.32.2.4987",
          indexerCount: 12,
          enabledCount: 8,
          indexerStatusCount: 3,
          healthErrors: 1,
          healthWarnings: 2,
        }}
      />,
    );
    expect(screen.getByText("Version 1.32.2.4987")).toBeTruthy();
    expect(screen.getByText("12 indexeurs · 8 actifs")).toBeTruthy();
    expect(screen.getByText("3 statuts")).toBeTruthy();
    expect(screen.getByText("Santé 1 erreurs · 2 avertissements")).toBeTruthy();
  });

  it("renders a qBittorrent transfer widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "qbt-1",
          widgetType: "qbittorrent-transfer",
          widgetVersion: 1,
          title: "qBittorrent",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        qbittorrentView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-15T00:00:00.000Z",
          downloadSpeedBps: 1024,
          uploadSpeedBps: 256,
          active: 2,
          queued: 3,
        }}
      />,
    );
    expect(screen.getByText("2 actifs · 3 en file")).toBeTruthy();
  });

  it("renders a Radarr overview widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "radarr-1",
          widgetType: "radarr-overview",
          widgetVersion: 1,
          title: "Radarr",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        radarrView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-15T00:00:00.000Z",
          version: "5.26.2.10099",
          movieCount: 12,
          queueTotalCount: 4,
          healthErrors: 1,
          healthWarnings: 2,
        }}
      />,
    );
    expect(screen.getByText("Version 5.26.2.10099")).toBeTruthy();
    expect(screen.getByText("12 films")).toBeTruthy();
    expect(screen.getByText("File 4")).toBeTruthy();
    expect(screen.getByText("Santé 1 erreurs · 2 avertissements")).toBeTruthy();
  });

  it("renders a Sonarr overview widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "sonarr-1",
          widgetType: "sonarr-overview",
          widgetVersion: 1,
          title: "Sonarr",
          config: { integrationId: "11111111-1111-4111-8111-111111111111" },
          runtimeStatus: "ready",
        }}
        sonarrView={{
          status: "ready",
          overviewStatus: "available",
          fetchedAt: "2026-09-15T00:00:00.000Z",
          version: "4.0.14.2939",
          seriesCount: 12,
          queueTotalCount: 4,
          healthErrors: 1,
          healthWarnings: 2,
        }}
      />,
    );
    expect(screen.getByText("Version 4.0.14.2939")).toBeTruthy();
    expect(screen.getByText("12 séries")).toBeTruthy();
    expect(screen.getByText("File 4")).toBeTruthy();
    expect(screen.getByText("Santé 1 erreurs · 2 avertissements")).toBeTruthy();
  });

  it("renders a Prometheus metric widget from a ready view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "prom-1",
          widgetType: "prometheus-metric",
          widgetVersion: 1,
          title: "Prom",
          config: {
            integrationId: "11111111-1111-4111-8111-111111111111",
            query: "up",
            mode: "instant",
            rangeSeconds: 900,
            stepSeconds: 60,
          },
          runtimeStatus: "ready",
        }}
        prometheusView={{
          status: "ready",
          resultType: "vector",
          queryName: "up",
          lastValue: 1,
          seriesCount: 1,
          truncated: false,
          overviewStatus: "available",
          fetchedAt: "2026-09-13T00:00:00.000Z",
          sparkline: [],
        }}
      />,
    );
    expect(screen.getByText("up")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
    expect(screen.getByText("1 série")).toBeTruthy();
  });

  it("renders a service status widget from a ready mixed view", () => {
    render(
      <WidgetRenderer
        item={{
          id: "status-1",
          widgetType: "service-status",
          widgetVersion: 1,
          title: "Services",
          config: {
            selectedSources: [],
            selectedIds: [],
            displayMode: "list",
            maxItems: 12,
          },
          runtimeStatus: "ready",
        }}
        serviceStatusView={{
          status: "ready",
          overviewStatus: "degraded",
          displayMode: "list",
          fetchedAt: "2026-09-13T00:00:00.000Z",
          truncated: false,
          partial: true,
          items: [
            {
              id: "jellyfin:11111111-1111-4111-8111-111111111111",
              name: "Media",
              sourceType: "jellyfin",
              integrationId: "11111111-1111-4111-8111-111111111111",
              status: "up",
              detail: null,
              updatedAt: "2026-09-13T00:00:00.000Z",
            },
            {
              id: "app:22222222-2222-4222-8222-222222222222",
              name: "Docs",
              sourceType: "app",
              integrationId: null,
              status: "down",
              detail: "Indisponible",
              updatedAt: null,
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("Media")).toBeTruthy();
    expect(screen.getByText("Docs")).toBeTruthy();
    expect(screen.getByText("En ligne")).toBeTruthy();
    expect(screen.getByText("Hors ligne")).toBeTruthy();
    expect(screen.getByText("Certaines sources sont indisponibles")).toBeTruthy();
  });
});
