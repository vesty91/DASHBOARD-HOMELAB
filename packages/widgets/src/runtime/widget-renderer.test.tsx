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
});
