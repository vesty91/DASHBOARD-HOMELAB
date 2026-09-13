"use client";
import type { ImmichStatsView } from "../immich-stats";

function formatCount(value: number | null): string {
  if (value === null) return "Indisponible";
  return String(value);
}

function formatBytes(value: number | null): string {
  if (value === null) return "Indisponible";
  const gib = value / 1024 / 1024 / 1024;
  if (gib >= 1) return `${gib.toFixed(1)} Gio`;
  const mib = value / 1024 / 1024;
  if (mib >= 1) return `${mib.toFixed(1)} Mio`;
  return `${value} o`;
}

function formatPercent(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value)} %`;
}

export function ImmichStatsWidget({ view }: { view: ImmichStatsView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Immich</p>;
  if (view.status === "empty") return <p role="status">Intégration Immich introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-immich-stats">
      <p>
        Immich
        {view.version ? ` · ${view.version}` : ""}
      </p>
      <p className="widget-state">
        {view.healthOk === true
          ? "En ligne"
          : view.healthOk === false
            ? "Hors ligne"
            : "Santé indisponible"}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>Photos {formatCount(view.photos)}</p>
      <p>Vidéos {formatCount(view.videos)}</p>
      <p>
        Stockage {formatBytes(view.diskUseBytes)} / {formatBytes(view.diskSizeBytes)} (
        {formatPercent(view.diskUsagePercent)})
      </p>
    </div>
  );
}
