"use client";
import type { GrafanaStatusDraftConfig } from "../grafana-status";

export interface GrafanaIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function GrafanaStatusForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: GrafanaStatusDraftConfig;
  onChange: (config: GrafanaStatusDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly GrafanaIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Grafana lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Grafana</span>
      <select
        value={config.integrationId}
        onChange={(event) => onChange({ integrationId: event.target.value })}
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
  );
}
