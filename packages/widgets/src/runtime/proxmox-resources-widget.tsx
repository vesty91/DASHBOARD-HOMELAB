"use client";
import type { ProxmoxResourcesView } from "../proxmox-resources";

function formatPercent(value: number | null): string {
  if (value === null) return "Indisponible";
  return `${Math.round(value * 100)} %`;
}

function formatBytes(value: number | null): string {
  if (value === null) return "Indisponible";
  if (value >= 1_073_741_824) return `${(value / 1_073_741_824).toFixed(1)} Gio`;
  if (value >= 1_048_576) return `${Math.round(value / 1_048_576)} Mio`;
  return `${value} o`;
}

export function ProxmoxResourcesWidget({ view }: { view: ProxmoxResourcesView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Proxmox</p>;
  if (view.status === "empty") return <p role="status">Intégration Proxmox introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-proxmox-resources">
      <p>
        {view.onlineNodeCount} / {view.nodeCount} nœuds en ligne
        {view.truncated ? " · liste tronquée" : ""}
      </p>
      <p className="widget-state">
        {view.vmRunning}/{view.vmCount} VM · {view.lxcRunning}/{view.lxcCount} CT
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <p>CPU {formatPercent(view.cpuRatio)}</p>
      <p>
        RAM {formatBytes(view.memoryUsedBytes)} / {formatBytes(view.memoryTotalBytes)}
      </p>
    </div>
  );
}
