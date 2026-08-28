"use client";
import type { WidgetRuntimeState } from "../types";

const labels: Record<WidgetRuntimeState, string> = {
  ready: "",
  loading: "Chargement…",
  empty: "App introuvable",
  error: "Ce widget a rencontré une erreur",
  stale: "Données non actualisées",
  disconnected: "Source déconnectée",
  "permission-denied": "Permission insuffisante",
  "configuration-missing": "Configuration invalide",
};

export function widgetStateLabel(state: WidgetRuntimeState, message?: string): string {
  if (message) return message;
  return labels[state];
}

export function WidgetStateView({
  state,
  message,
}: {
  state: WidgetRuntimeState;
  message?: string;
}) {
  return (
    <p className="widget-state" role="status">
      {widgetStateLabel(state, message)}
    </p>
  );
}
