"use client";
import type { PrometheusMetricView } from "../prometheus-metric";

function formatValue(value: number | null): string {
  if (value === null) return "Indisponible";
  if (Number.isInteger(value)) return String(value);
  return value.toPrecision(6);
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
    <svg viewBox="0 0 100 24" role="img" aria-label="Tendance">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={points} />
    </svg>
  );
}

export function PrometheusMetricWidget({ view }: { view: PrometheusMetricView | undefined }) {
  if (!view || view.status === "loading") return <p role="status">Chargement…</p>;
  if (view.status === "permission-denied") return <p role="status">Permission insuffisante</p>;
  if (view.status === "configuration-missing")
    return <p role="status">Sélectionnez une intégration Prometheus</p>;
  if (view.status === "empty") return <p role="status">Intégration Prometheus introuvable</p>;
  if (view.status === "error") return <p role="status">Ce widget a rencontré une erreur</p>;
  return (
    <div className="widget-prometheus-metric">
      <p>
        <strong>{view.queryName}</strong>
      </p>
      <p>{formatValue(view.lastValue)}</p>
      <p className="widget-state">
        {view.seriesCount} série{view.seriesCount === 1 ? "" : "s"}
        {view.truncated ? " · liste tronquée" : ""}
        {view.overviewStatus === "degraded" ? " · vue partielle" : ""}
      </p>
      <Sparkline values={view.sparkline} />
    </div>
  );
}
