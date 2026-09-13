"use client";
import type { BeszelHostsView } from "../beszel-hosts";

function formatPercent(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value)} %`;
}

export function BeszelHostsWidget({ view }: { view: BeszelHostsView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Beszel</p>;
  if (view.status === "empty") return <p role="status">Intégration Beszel introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-beszel-hosts">
      <p>
        {view.upCount} / {view.hostCount} en ligne
        {view.truncated ? " · liste tronquée" : ""}
      </p>
      <p className="widget-state">
        {view.downCount > 0 ? `${view.downCount} hors ligne` : "Aucun hôte hors ligne"}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>CPU {formatPercent(view.cpuPercent)}</p>
      <p>RAM {formatPercent(view.memoryPercent)}</p>
      <p>Disque {formatPercent(view.diskPercent)}</p>
    </div>
  );
}
