import type { ActualStatus, ImpactStatus } from "@dashboard/topology";
import type { BadgeTone } from "@dashboard/ui";

export const ACTUAL_STATUS_LABELS: Record<ActualStatus, string> = {
  available: "Disponible",
  unavailable: "Indisponible",
  unknown: "Inconnu",
};

export const IMPACT_STATUS_LABELS: Record<ImpactStatus, string> = {
  none: "Aucun impact",
  "at-risk": "À risque",
  impacted: "Impacté",
};

export function actualStatusTone(status: ActualStatus): BadgeTone {
  switch (status) {
    case "available":
      return "success";
    case "unavailable":
      return "danger";
    case "unknown":
      return "neutral";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function impactStatusTone(status: ImpactStatus): BadgeTone {
  switch (status) {
    case "none":
      return "neutral";
    case "at-risk":
      return "warning";
    case "impacted":
      return "danger";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

/** Soft UI bound — never render unbounded topology graphs. */
export const TOPOLOGY_UI_MAX_SERVICES = 100;
export const TOPOLOGY_UI_MAX_EDGES = 200;
