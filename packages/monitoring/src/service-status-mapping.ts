import type { ServiceStatusCanonical } from "./service-status-types";

export type AppHealthInput = "unknown" | "up" | "down" | "timeout" | "error";

export type DockerContainerStateInput =
  "created" | "running" | "paused" | "restarting" | "removing" | "exited" | "dead" | "unknown";

export type DockerHealthInput = "healthy" | "unhealthy" | "starting" | "none" | "unknown";

export type OverviewStatusInput = "available" | "degraded";

export type BeszelHostStatusInput = "up" | "down" | "paused" | "pending";

export type UptimeKumaMonitorStatusInput = "up" | "down" | "pending" | "maintenance";

export function mapAppHealth(
  healthStatus: AppHealthInput,
  healthcheckEnabled: boolean,
): ServiceStatusCanonical {
  if (!healthcheckEnabled) return "unknown";
  switch (healthStatus) {
    case "up":
      return "up";
    case "down":
    case "timeout":
    case "error":
      return "down";
    case "unknown":
      return "unknown";
    default: {
      const exhaustive: never = healthStatus;
      return exhaustive;
    }
  }
}

export function mapDockerContainer(
  state: DockerContainerStateInput,
  health: DockerHealthInput,
): ServiceStatusCanonical {
  switch (state) {
    case "paused":
      return "paused";
    case "running":
      switch (health) {
        case "healthy":
        case "none":
          return "up";
        case "unhealthy":
          return "degraded";
        case "starting":
        case "unknown":
          return "unknown";
        default: {
          const exhaustive: never = health;
          return exhaustive;
        }
      }
    case "restarting":
      return "degraded";
    case "created":
    case "removing":
    case "exited":
    case "dead":
      return "down";
    case "unknown":
      return "unknown";
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

export function mapOverviewStatus(status: OverviewStatusInput): ServiceStatusCanonical {
  switch (status) {
    case "available":
      return "up";
    case "degraded":
      return "degraded";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function mapBeszelHosts(input: {
  overviewStatus: OverviewStatusInput;
  hostCount: number;
  upCount: number;
  downCount: number;
  pausedCount: number;
  pendingCount: number;
}): ServiceStatusCanonical {
  if (input.overviewStatus === "degraded") {
    if (input.hostCount === 0) return "degraded";
  }
  if (input.hostCount <= 0) return "unknown";
  if (input.pausedCount === input.hostCount) return "paused";
  if (input.downCount === input.hostCount) return "down";
  if (input.downCount > 0 || input.pendingCount > 0 || input.overviewStatus === "degraded")
    return "degraded";
  if (input.upCount === input.hostCount) return "up";
  return "unknown";
}

export function mapUptimeKumaMonitors(input: {
  overviewStatus: OverviewStatusInput;
  monitorCount: number;
  upCount: number;
  downCount: number;
  pendingCount: number;
  maintenanceCount: number;
}): ServiceStatusCanonical {
  if (input.monitorCount <= 0) return input.overviewStatus === "degraded" ? "degraded" : "unknown";
  if (input.maintenanceCount === input.monitorCount) return "maintenance";
  if (input.downCount === input.monitorCount) return "down";
  if (input.downCount > 0 || input.pendingCount > 0 || input.overviewStatus === "degraded")
    return "degraded";
  if (input.upCount === input.monitorCount) return "up";
  return "unknown";
}

export function mapPrometheusUpSeries(input: {
  overviewStatus: OverviewStatusInput;
  values: readonly (number | null)[];
}): ServiceStatusCanonical {
  if (input.overviewStatus === "degraded") return "degraded";
  const finite = input.values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (finite.length === 0) return "unknown";
  const upCount = finite.filter((value) => value > 0).length;
  if (upCount === finite.length) return "up";
  if (upCount === 0) return "down";
  return "degraded";
}

export function mapImmichHealth(input: {
  overviewStatus: OverviewStatusInput;
  healthOk: boolean | null;
}): ServiceStatusCanonical {
  if (input.healthOk === false) return "down";
  if (input.overviewStatus === "degraded") return "degraded";
  if (input.healthOk === true) return "up";
  return "unknown";
}

export function appHealthDetail(
  healthStatus: AppHealthInput,
  healthcheckEnabled: boolean,
): string | null {
  if (!healthcheckEnabled) return "Vérification désactivée";
  switch (healthStatus) {
    case "up":
      return null;
    case "down":
      return "Indisponible";
    case "timeout":
      return "Délai dépassé";
    case "error":
      return "Erreur de sonde";
    case "unknown":
      return "Jamais vérifié";
    default: {
      const exhaustive: never = healthStatus;
      return exhaustive;
    }
  }
}
