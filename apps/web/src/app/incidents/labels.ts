import type { BadgeTone } from "@dashboard/ui";
import type { IncidentKind, IncidentStatus, NotificationSeverity } from "@dashboard/notifications";

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  open: "Ouvert",
  resolved: "Résolu",
};

export const INCIDENT_STATUS_TONES: Record<IncidentStatus, BadgeTone> = {
  open: "danger",
  resolved: "success",
};

export const INCIDENT_KIND_LABELS: Record<IncidentKind, string> = {
  availability: "Disponibilité",
};

export const INCIDENT_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: "Info",
  success: "Succès",
  warning: "Avertissement",
  error: "Erreur",
  critical: "Critique",
};

export function formatIncidentTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return "—";
  }
}

export function formatIncidentDuration(
  openedAt: string,
  resolvedAt: string | null,
  nowMs = Date.now(),
): string {
  const start = new Date(openedAt).getTime();
  if (Number.isNaN(start)) return "—";
  const end = resolvedAt ? new Date(resolvedAt).getTime() : nowMs;
  if (Number.isNaN(end) || end < start) return "—";
  const totalSeconds = Math.floor((end - start) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 48) return remMinutes > 0 ? `${hours} h ${remMinutes} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
}
