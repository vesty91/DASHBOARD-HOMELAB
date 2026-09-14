"use client";
import type { NtfyStatusView } from "../ntfy-status";

function healthLabel(healthy: boolean | null): string {
  if (healthy === true) return "Santé OK";
  if (healthy === false) return "Santé en échec";
  return "Santé indisponible";
}

function formatRate(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toPrecision(6).replace(/\.?0+$/u, "");
}

export function NtfyStatusWidget({ view }: { view: NtfyStatusView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration ntfy</p>;
  if (view.status === "empty") return <p role="status">Intégration ntfy introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-ntfy-status">
      <p>
        {healthLabel(view.healthy)}
        {view.version ? ` · ${view.version}` : ""}
      </p>
      <p className="widget-state">
        {view.messages === null ? "Compteurs indisponibles" : `${view.messages} messages`}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      {view.messagesRate !== null ? <p>Débit {formatRate(view.messagesRate)} msg/s</p> : null}
    </div>
  );
}
