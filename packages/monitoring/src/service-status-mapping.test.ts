import { describe, expect, it } from "vitest";
import {
  appHealthDetail,
  mapAppHealth,
  mapBeszelHosts,
  mapDockerContainer,
  mapImmichHealth,
  mapOverviewStatus,
  mapPrometheusUpSeries,
  mapUptimeKumaMonitors,
} from "./service-status-mapping";

describe("service status mapping", () => {
  it("maps app health including disabled checks", () => {
    expect(mapAppHealth("up", true)).toBe("up");
    expect(mapAppHealth("down", true)).toBe("down");
    expect(mapAppHealth("timeout", true)).toBe("down");
    expect(mapAppHealth("error", true)).toBe("down");
    expect(mapAppHealth("unknown", true)).toBe("unknown");
    expect(mapAppHealth("up", false)).toBe("unknown");
    expect(appHealthDetail("timeout", true)).toBe("Délai dépassé");
    expect(appHealthDetail("unknown", false)).toBe("Vérification désactivée");
  });

  it("maps docker container states", () => {
    expect(mapDockerContainer("running", "healthy")).toBe("up");
    expect(mapDockerContainer("running", "none")).toBe("up");
    expect(mapDockerContainer("running", "unhealthy")).toBe("degraded");
    expect(mapDockerContainer("running", "starting")).toBe("unknown");
    expect(mapDockerContainer("paused", "healthy")).toBe("paused");
    expect(mapDockerContainer("exited", "unhealthy")).toBe("down");
    expect(mapDockerContainer("dead", "none")).toBe("down");
    expect(mapDockerContainer("restarting", "none")).toBe("degraded");
    expect(mapDockerContainer("unknown", "unknown")).toBe("unknown");
  });

  it("maps overview, Immich, Beszel, Kuma and Prometheus summaries", () => {
    expect(mapOverviewStatus("available")).toBe("up");
    expect(mapOverviewStatus("degraded")).toBe("degraded");
    expect(mapImmichHealth({ overviewStatus: "available", healthOk: true })).toBe("up");
    expect(mapImmichHealth({ overviewStatus: "available", healthOk: false })).toBe("down");
    expect(mapImmichHealth({ overviewStatus: "degraded", healthOk: true })).toBe("degraded");
    expect(mapImmichHealth({ overviewStatus: "available", healthOk: null })).toBe("unknown");
    expect(
      mapBeszelHosts({
        overviewStatus: "available",
        hostCount: 2,
        upCount: 2,
        downCount: 0,
        pausedCount: 0,
        pendingCount: 0,
      }),
    ).toBe("up");
    expect(
      mapBeszelHosts({
        overviewStatus: "available",
        hostCount: 2,
        upCount: 0,
        downCount: 2,
        pausedCount: 0,
        pendingCount: 0,
      }),
    ).toBe("down");
    expect(
      mapBeszelHosts({
        overviewStatus: "available",
        hostCount: 2,
        upCount: 0,
        downCount: 0,
        pausedCount: 2,
        pendingCount: 0,
      }),
    ).toBe("paused");
    expect(
      mapBeszelHosts({
        overviewStatus: "available",
        hostCount: 3,
        upCount: 1,
        downCount: 1,
        pausedCount: 0,
        pendingCount: 1,
      }),
    ).toBe("degraded");
    expect(
      mapUptimeKumaMonitors({
        overviewStatus: "available",
        monitorCount: 2,
        upCount: 0,
        downCount: 0,
        pendingCount: 0,
        maintenanceCount: 2,
      }),
    ).toBe("maintenance");
    expect(
      mapUptimeKumaMonitors({
        overviewStatus: "available",
        monitorCount: 2,
        upCount: 1,
        downCount: 1,
        pendingCount: 0,
        maintenanceCount: 0,
      }),
    ).toBe("degraded");
    expect(mapPrometheusUpSeries({ overviewStatus: "available", values: [1, 1] })).toBe("up");
    expect(mapPrometheusUpSeries({ overviewStatus: "available", values: [0, 0] })).toBe("down");
    expect(mapPrometheusUpSeries({ overviewStatus: "available", values: [1, 0] })).toBe("degraded");
    expect(mapPrometheusUpSeries({ overviewStatus: "available", values: [null] })).toBe("unknown");
    expect(mapPrometheusUpSeries({ overviewStatus: "degraded", values: [1] })).toBe("degraded");
  });
});
