"use client";
import type { RadarrOverviewDraftConfig } from "../radarr-overview";

export interface RadarrIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function RadarrOverviewForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: RadarrOverviewDraftConfig;
  onChange: (config: RadarrOverviewDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly RadarrIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Radarr lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Radarr</span>
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
