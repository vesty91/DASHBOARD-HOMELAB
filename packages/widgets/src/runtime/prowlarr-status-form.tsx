"use client";
import type { ProwlarrStatusDraftConfig } from "../prowlarr-status";

export interface ProwlarrIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function ProwlarrStatusForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: ProwlarrStatusDraftConfig;
  onChange: (config: ProwlarrStatusDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly ProwlarrIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Prowlarr lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Prowlarr</span>
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
