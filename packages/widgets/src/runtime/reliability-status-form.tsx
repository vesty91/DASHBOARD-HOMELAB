"use client";
import {
  RELIABILITY_STATUS_WINDOW_DAYS,
  type ReliabilityStatusDraftConfig,
} from "../reliability-status";

export interface ReliabilityIntegrationOption {
  id: string;
  name: string;
  type: string;
}

export function ReliabilityStatusForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: ReliabilityStatusDraftConfig;
  onChange: (config: ReliabilityStatusDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly ReliabilityIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  return (
    <fieldset className="ui-field">
      <legend className="ui-label">Fiabilité SLO</legend>
      <label className="ui-field">
        <span className="ui-label">Intégration</span>
        <select
          className="ui-input"
          value={config.serviceKey}
          onChange={(event) => onChange({ ...config, serviceKey: event.target.value })}
        >
          <option value="">Sélectionner…</option>
          {integrations.map((integration) => (
            <option key={integration.id} value={integration.id}>
              {integration.name} ({integration.type})
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field">
        <span className="ui-label">Fenêtre (jours)</span>
        <select
          className="ui-input"
          value={config.windowDays}
          onChange={(event) =>
            onChange({
              ...config,
              windowDays: Number(event.target.value) as ReliabilityStatusDraftConfig["windowDays"],
            })
          }
        >
          {RELIABILITY_STATUS_WINDOW_DAYS.map((days) => (
            <option key={days} value={days}>
              {days} jours
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field ui-checkbox">
        <input
          type="checkbox"
          checked={config.showSparkline}
          onChange={(event) => onChange({ ...config, showSparkline: event.target.checked })}
        />
        Afficher la tendance
      </label>
    </fieldset>
  );
}
