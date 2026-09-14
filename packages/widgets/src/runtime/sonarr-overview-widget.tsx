"use client";
import type { SonarrOverviewView } from "../sonarr-overview";

function versionLabel(version: string | null): string {
  return version ? `Version ${version}` : "Version indisponible";
}

export function SonarrOverviewWidget({ view }: { view: SonarrOverviewView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Sonarr</p>;
  if (view.status === "empty") return <p role="status">Intégration Sonarr introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-sonarr-overview">
      <p>{versionLabel(view.version)}</p>
      <p className="widget-state">
        {view.seriesCount === null ? "Séries indisponibles" : `${view.seriesCount} séries`}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>
        {view.queueTotalCount === null
          ? "File d'attente indisponible"
          : `File ${view.queueTotalCount}`}
      </p>
      <p>
        {view.healthErrors === null || view.healthWarnings === null
          ? "Santé indisponible"
          : `Santé ${view.healthErrors} erreurs · ${view.healthWarnings} avertissements`}
      </p>
    </div>
  );
}
