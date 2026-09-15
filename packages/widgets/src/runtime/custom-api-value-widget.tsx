"use client";
import type { CustomApiValueView } from "../custom-api-value";

function renderReady(view: Extract<CustomApiValueView, { status: "ready" }>): string {
  const prefix = view.label ? `${view.label} · ` : "";
  const suffix = view.unit ? ` ${view.unit}` : "";
  switch (view.display) {
    case "text":
      return `${prefix}${view.text ?? "Valeur indisponible"}${suffix}`;
    case "number":
      return `${prefix}${view.number === null ? "Valeur indisponible" : String(view.number)}${suffix}`;
    case "badge":
      return `${prefix}${view.badgeLabel ?? "Valeur indisponible"}${suffix}`;
    case "list":
      return view.listItems && view.listItems.length > 0
        ? `${prefix}${view.listItems.join(" · ")}${view.listTruncated ? " · …" : ""}`
        : `${prefix}Liste indisponible`;
    default: {
      const _exhaustive: never = view.display;
      return String(_exhaustive);
    }
  }
}

export function CustomApiValueWidget({ view }: { view: CustomApiValueView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration API personnalisée</p>;
  if (view.status === "empty")
    return <p role="status">Intégration API personnalisée introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-custom-api-value">
      <p className="widget-state">
        {renderReady(view)}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
    </div>
  );
}
