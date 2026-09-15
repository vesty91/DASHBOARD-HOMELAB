"use client";
import type { ProwlarrStatusView } from "../prowlarr-status";

function versionLabel(version: string | null): string {
  return version ? `Version ${version}` : "Version indisponible";
}

export function ProwlarrStatusWidget({ view }: { view: ProwlarrStatusView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Prowlarr</p>;
  if (view.status === "empty") return <p role="status">Intégration Prowlarr introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-prowlarr-status">
      <p>{versionLabel(view.version)}</p>
      <p className="widget-state">
        {view.indexerCount === null || view.enabledCount === null
          ? "Indexeurs indisponibles"
          : `${view.indexerCount} indexeurs · ${view.enabledCount} actifs`}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>
        {view.indexerStatusCount === null
          ? "Statuts indexeurs indisponibles"
          : `${view.indexerStatusCount} statuts`}
      </p>
      <p>
        {view.healthErrors === null || view.healthWarnings === null
          ? "Santé indisponible"
          : `Santé ${view.healthErrors} erreurs · ${view.healthWarnings} avertissements`}
      </p>
    </div>
  );
}
