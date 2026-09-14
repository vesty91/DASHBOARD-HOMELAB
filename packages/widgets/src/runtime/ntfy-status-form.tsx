"use client";
import type { NtfyStatusDraftConfig } from "../ntfy-status";

export interface NtfyIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function NtfyStatusForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: NtfyStatusDraftConfig;
  onChange: (config: NtfyStatusDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly NtfyIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration ntfy lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration ntfy</span>
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
