"use client";
import type { ReliabilityStatusView } from "../reliability-status";

function formatPercent(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 1000).toFixed(3)} %`;
}

function Sparkline({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 24 - ((value - min) / span) * 24;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 24" role="img" aria-label="Tendance de disponibilité">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}

export function ReliabilityStatusWidget({ view }: { view: ReliabilityStatusView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration</p>;
  if (view.status === "empty") return <p role="status">Intégration introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-reliability-status" data-testid="widget-reliability-status">
      <p>
        <strong>{view.serviceName}</strong>
      </p>
      <p>{formatPercent(view.availabilityBasisPoints)}</p>
      {view.sloName ? (
        <p className="widget-state">
          SLO {view.sloName} ({formatPercent(view.objectiveBasisPoints)})
          {view.sloMet === null ? "" : view.sloMet ? " · respecté" : " · dépassé"}
        </p>
      ) : (
        <p className="widget-state">Aucun SLO configuré</p>
      )}
      {view.remainingBudgetBasisPoints !== null ? (
        <p className="widget-state">
          Budget restant {formatPercent(view.remainingBudgetBasisPoints)}
        </p>
      ) : null}
      <Sparkline values={view.sparkline} />
    </div>
  );
}
