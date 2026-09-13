"use client";
import type { PrometheusMetricDraftConfig } from "../prometheus-metric";

export interface PrometheusIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function PrometheusMetricForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: PrometheusMetricDraftConfig;
  onChange: (config: PrometheusMetricDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly PrometheusIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Prometheus lisible</p>;
  return (
    <div className="widget-prometheus-metric-form">
      <label className="ui-field">
        <span className="ui-label">Intégration Prometheus</span>
        <select
          value={config.integrationId}
          onChange={(event) => onChange({ ...config, integrationId: event.target.value })}
        >
          <option value="">Sélectionner…</option>
          {integrations.map((integration) => (
            <option key={integration.id} value={integration.id}>
              {integration.name}
              {integration.enabled ? "" : " (désactivée)"}
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field">
        <span className="ui-label">Requête PromQL</span>
        <input
          value={config.query}
          maxLength={512}
          onChange={(event) => onChange({ ...config, query: event.target.value })}
        />
      </label>
      <label className="ui-field">
        <span className="ui-label">Mode</span>
        <select
          value={config.mode}
          onChange={(event) =>
            onChange({
              ...config,
              mode: event.target.value === "range" ? "range" : "instant",
            })
          }
        >
          <option value="instant">Instantané</option>
          <option value="range">Plage</option>
        </select>
      </label>
      {config.mode === "range" ? (
        <>
          <label className="ui-field">
            <span className="ui-label">Plage (secondes)</span>
            <input
              type="number"
              min={60}
              max={21600}
              value={config.rangeSeconds}
              onChange={(event) =>
                onChange({ ...config, rangeSeconds: Number(event.target.value) })
              }
            />
          </label>
          <label className="ui-field">
            <span className="ui-label">Pas (secondes)</span>
            <input
              type="number"
              min={15}
              max={3600}
              value={config.stepSeconds}
              onChange={(event) => onChange({ ...config, stepSeconds: Number(event.target.value) })}
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
