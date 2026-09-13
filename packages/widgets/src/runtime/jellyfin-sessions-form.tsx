"use client";
import type { JellyfinSessionsDraftConfig } from "../jellyfin-sessions";

export interface JellyfinIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function JellyfinSessionsForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: JellyfinSessionsDraftConfig;
  onChange: (config: JellyfinSessionsDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly JellyfinIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Jellyfin lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Jellyfin</span>
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
