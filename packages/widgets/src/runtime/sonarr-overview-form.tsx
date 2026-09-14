"use client";
import type { SonarrOverviewDraftConfig } from "../sonarr-overview";

export interface SonarrIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function SonarrOverviewForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: SonarrOverviewDraftConfig;
  onChange: (config: SonarrOverviewDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly SonarrIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Sonarr lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Sonarr</span>
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
