"use client";
import type { ImmichStatsDraftConfig } from "../immich-stats";

export interface ImmichIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function ImmichStatsForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: ImmichStatsDraftConfig;
  onChange: (config: ImmichStatsDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly ImmichIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Immich lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Immich</span>
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
