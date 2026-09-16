import type { IntegrationHealthStatus, PublicServiceStatus } from "./types";

/**
 * Maps integration health + incidents + maintenance into the public status enum.
 *
 * IntegrationStatus:
 * - available → operational
 * - unavailable → outage
 * - unknown → unknown
 *
 * Open availability incident → outage (truthful for the service).
 * Active maintenance for the target → maintenance (display preference on the
 * status page; incidents remain truthful internally via open-incident checks).
 *
 * Overall page priority: outage > degraded > maintenance > unknown > operational
 */
export function mapIntegrationStatusToPublic(status: IntegrationHealthStatus): PublicServiceStatus {
  switch (status) {
    case "available":
      return "operational";
    case "unavailable":
      return "outage";
    case "unknown":
      return "unknown";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function resolvePublicServiceStatus(input: {
  integrationStatus: IntegrationHealthStatus | null;
  hasOpenAvailabilityIncident: boolean;
  hasActiveMaintenance: boolean;
}): PublicServiceStatus {
  if (input.integrationStatus == null) return "unknown";
  if (input.hasOpenAvailabilityIncident) return "outage";
  const base = mapIntegrationStatusToPublic(input.integrationStatus);
  if (base === "outage") return "outage";
  if (input.hasActiveMaintenance) return "maintenance";
  return base;
}

const OVERALL_PRIORITY: Readonly<Record<PublicServiceStatus, number>> = {
  outage: 5,
  degraded: 4,
  maintenance: 3,
  unknown: 2,
  operational: 1,
};

export function pickOverallStatus(statuses: readonly PublicServiceStatus[]): PublicServiceStatus {
  if (statuses.length === 0) return "unknown";
  let worst: PublicServiceStatus = "operational";
  for (const status of statuses) {
    if (OVERALL_PRIORITY[status] > OVERALL_PRIORITY[worst]) worst = status;
  }
  return worst;
}
