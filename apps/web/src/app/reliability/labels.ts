import type { BurnRateState, SloWindowDays } from "@dashboard/reliability";

export const SLO_WINDOW_LABELS: Record<SloWindowDays, string> = {
  7: "7 jours",
  30: "30 jours",
  90: "90 jours",
};

export const BURN_STATE_LABELS: Record<BurnRateState, string> = {
  healthy: "Sain",
  warning: "Avertissement",
  critical: "Critique",
  "insufficient-data": "Données insuffisantes",
};

export function burnStateTone(state: BurnRateState): "success" | "warning" | "danger" | "neutral" {
  switch (state) {
    case "healthy":
      return "success";
    case "warning":
      return "warning";
    case "critical":
      return "danger";
    case "insufficient-data":
      return "neutral";
    default: {
      const _never: never = state;
      return _never;
    }
  }
}

export function formatBurnRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}×`;
}

export function formatBudgetRemaining(fraction: number | null): string {
  if (fraction === null || !Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(1)} %`;
}

export function formatBasisPoints(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 1000).toFixed(3)} %`;
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return remMinutes > 0 ? `${hours} h ${remMinutes} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days} j ${remHours} h` : `${days} j`;
}

export function formatUtcDate(dateUtc: string): string {
  const parsed = Date.parse(`${dateUtc}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return dateUtc;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(parsed));
}

export function formatUtcDateTime(value: Date | string | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export function sloStatusLabel(met: boolean | null): string {
  if (met === null) return "Sans SLO";
  return met ? "Respecté" : "Dépassé";
}

export function sloStatusTone(met: boolean | null): "success" | "danger" | "neutral" {
  if (met === null) return "neutral";
  return met ? "success" : "danger";
}
