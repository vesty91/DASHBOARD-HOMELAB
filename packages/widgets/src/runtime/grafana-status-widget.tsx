"use client";
import type { GrafanaStatusView } from "../grafana-status";

function healthLabel(database: "ok" | "failing" | null, version: string | null): string {
  const status =
    database === "ok"
      ? "Santé OK"
      : database === "failing"
        ? "Santé en échec"
        : "Santé indisponible";
  return version ? `${status} · ${version}` : status;
}

export function GrafanaStatusWidget({ view }: { view: GrafanaStatusView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Grafana</p>;
  if (view.status === "empty") return <p role="status">Intégration Grafana introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-grafana-status">
      <p>{healthLabel(view.database, view.version)}</p>
      <p className="widget-state">
        {view.dashboardCount === null
          ? "Tableaux de bord indisponibles"
          : `${view.dashboardCount} tableaux de bord`}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>
        {view.alertsFiring === null || view.alertsPending === null
          ? "Alertes indisponibles"
          : `Alertes ${view.alertsFiring} firing · ${view.alertsPending} pending`}
      </p>
    </div>
  );
}
