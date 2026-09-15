"use client";
import type { SeerrRequestsView } from "../seerr-requests";

function versionLabel(version: string | null): string {
  return version ? `Version ${version}` : "Version indisponible";
}

export function SeerrRequestsWidget({ view }: { view: SeerrRequestsView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Seerr</p>;
  if (view.status === "empty") return <p role="status">Intégration Seerr introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-seerr-requests">
      <p>{versionLabel(view.version)}</p>
      <p className="widget-state">
        {view.pending === null ||
        view.approved === null ||
        view.processing === null ||
        view.available === null
          ? "Compteurs indisponibles"
          : `${view.pending} en attente · ${view.approved} approuvées · ${view.processing} en cours · ${view.available} disponibles`}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
    </div>
  );
}
