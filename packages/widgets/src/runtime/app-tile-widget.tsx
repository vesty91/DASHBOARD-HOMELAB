"use client";
import type { AppTileConfig, AppTileView } from "../app-tile";

function healthLabel(app: Extract<AppTileView, { status: "ready" }>["app"]): string {
  if (!app.healthcheckEnabled) return "Vérification désactivée";
  if (app.healthStatus === "unknown" || app.lastCheckedAt === null) return "Non vérifié";
  switch (app.healthStatus) {
    case "up":
      return "Disponible";
    case "down":
      return "Indisponible";
    case "timeout":
      return "Délai dépassé";
    case "error":
      return "Erreur de vérification";
    default: {
      const exhaustive: never = app.healthStatus;
      return exhaustive;
    }
  }
}

export function AppTileWidget({
  config,
  view,
}: {
  config: AppTileConfig;
  view: AppTileView | undefined;
}) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "empty") return <p role="status">App introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  const app = view.app;
  const link =
    app.target === "new-tab" ? (
      <a href={app.url} target="_blank" rel="noopener noreferrer">
        {app.name}
      </a>
    ) : (
      <a href={app.url}>{app.name}</a>
    );
  return (
    <div className="widget-app-tile" style={app.color ? { borderColor: app.color } : undefined}>
      {app.iconRef ? <img src={app.iconRef} alt="" width={32} height={32} /> : null}
      <p>{link}</p>
      {config.showStatus ? <p>{healthLabel(app)}</p> : null}
      {config.showLatency && app.lastLatencyMs != null ? <p>{app.lastLatencyMs} ms</p> : null}
      {app.lastCheckedAt ? (
        <p>
          Vérifié le{" "}
          {new Intl.DateTimeFormat("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(app.lastCheckedAt))}
        </p>
      ) : null}
    </div>
  );
}
