"use client";
import type { SeerrRequestsDraftConfig } from "../seerr-requests";

export interface SeerrIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function SeerrRequestsForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: SeerrRequestsDraftConfig;
  onChange: (config: SeerrRequestsDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly SeerrIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Seerr lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Seerr</span>
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
