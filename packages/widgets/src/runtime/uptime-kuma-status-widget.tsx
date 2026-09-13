"use client";
import type { UptimeKumaStatusView } from "../uptime-kuma-status";

function formatLatency(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value)} ms`;
}

export function UptimeKumaStatusWidget({ view }: { view: UptimeKumaStatusView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Uptime Kuma</p>;
  if (view.status === "empty") return <p role="status">Intégration Uptime Kuma introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-uptime-kuma-status">
      <p>
        {view.upCount} / {view.monitorCount} en ligne
        {view.truncated ? " · liste tronquée" : ""}
      </p>
      <p className="widget-state">
        {view.downCount > 0 ? `${view.downCount} hors ligne` : "Aucun moniteur hors ligne"}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>{view.maintenanceCount} en maintenance</p>
      <p>Latence {formatLatency(view.latencyMs)}</p>
    </div>
  );
}
