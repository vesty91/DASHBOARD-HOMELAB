"use client";
import type { ServiceStatusCanonical, ServiceStatusView } from "../service-status";

const STATUS_LABELS: Record<ServiceStatusCanonical, string> = {
  up: "En ligne",
  degraded: "Dégradé",
  down: "Hors ligne",
  unknown: "Inconnu",
  paused: "En pause",
  maintenance: "Maintenance",
};

const SOURCE_LABELS = {
  app: "Application",
  docker: "Docker",
  synology: "Synology",
  jellyfin: "Jellyfin",
  immich: "Immich",
  beszel: "Beszel",
  "uptime-kuma": "Uptime Kuma",
  prometheus: "Prometheus",
  proxmox: "Proxmox",
} as const;

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(parsed));
}

export function ServiceStatusWidget({ view }: { view: ServiceStatusView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Configuration du statut des services invalide</p>;
  if (view.status === "empty") return <p role="status">Aucun service à afficher</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  if (view.items.length === 0) return <p role="status">Aucun service à afficher</p>;
  return (
    <div className="widget-service-status" data-display-mode={view.displayMode}>
      {view.partial ? <p className="widget-state">Certaines sources sont indisponibles</p> : null}
      <ul className="widget-service-status-list">
        {view.items.map((item) => {
          const updatedAt = formatUpdatedAt(item.updatedAt);
          return (
            <li
              key={item.id}
              className="widget-service-status-item"
              data-service-id={item.id}
              data-service-status={item.status}
              data-source-type={item.sourceType}
            >
              <span className="widget-service-status-name">{item.name}</span>
              <span className="widget-service-status-source">{SOURCE_LABELS[item.sourceType]}</span>
              <span className="widget-service-status-state">{STATUS_LABELS[item.status]}</span>
              {item.detail ? (
                <span className="widget-service-status-detail">{item.detail}</span>
              ) : null}
              {updatedAt ? (
                <span className="widget-service-status-updated">{updatedAt}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {view.truncated ? <p className="widget-state">Liste tronquée</p> : null}
    </div>
  );
}
