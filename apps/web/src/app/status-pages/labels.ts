import type { BadgeTone } from "@dashboard/ui";
import type {
  MaintenanceWindowStatus,
  PublicServiceStatus,
  StatusPageVisibility,
} from "@dashboard/status-pages";

export const PUBLIC_STATUS_LABELS: Record<PublicServiceStatus, string> = {
  operational: "Opérationnel",
  degraded: "Dégradé",
  outage: "Panne",
  maintenance: "Maintenance",
  unknown: "Inconnu",
};

export const PUBLIC_STATUS_TONES: Record<PublicServiceStatus, BadgeTone> = {
  operational: "success",
  degraded: "warning",
  outage: "danger",
  maintenance: "accent",
  unknown: "neutral",
};

export const VISIBILITY_LABELS: Record<StatusPageVisibility, string> = {
  private: "Privée",
  public: "Publique",
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceWindowStatus, string> = {
  scheduled: "Planifiée",
  active: "Active",
  completed: "Terminée",
  cancelled: "Annulée",
};

export const MAINTENANCE_STATUS_TONES: Record<MaintenanceWindowStatus, BadgeTone> = {
  scheduled: "accent",
  active: "warning",
  completed: "success",
  cancelled: "neutral",
};

export function formatStatusTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR", { timeZone: "UTC" }) + " UTC";
  } catch {
    return "—";
  }
}

/** Convert `datetime-local` value (assumed UTC wall clock) to ISO instant. */
export function utcLocalInputToIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Instant UTC requis");
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) throw new Error("Instant UTC invalide");
    return parsed.toISOString();
  }
  const normalized = trimmed.length === 16 ? `${trimmed}:00.000Z` : `${trimmed}.000Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) throw new Error("Instant UTC invalide");
  return parsed.toISOString();
}

export function isoToUtcLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}
