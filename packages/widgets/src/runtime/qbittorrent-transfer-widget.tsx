"use client";
import type { QbittorrentTransferView } from "../qbittorrent-transfer";

function formatSpeed(bytesPerSecond: number | null): string {
  if (bytesPerSecond === null) return "Indisponible";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} o/s`;
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} Kio/s`;
  return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} Mio/s`;
}

export function QbittorrentTransferWidget({ view }: { view: QbittorrentTransferView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration qBittorrent</p>;
  if (view.status === "empty") return <p role="status">Intégration qBittorrent introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-qbittorrent-transfer">
      <p>↓ {formatSpeed(view.downloadSpeedBps)}</p>
      <p>↑ {formatSpeed(view.uploadSpeedBps)}</p>
      <p className="widget-state">
        {view.active === null ? "Actifs indisponibles" : `${view.active} actifs`}
        {view.queued === null ? " · file indisponible" : ` · ${view.queued} en file`}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
    </div>
  );
}
