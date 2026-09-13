"use client";
import type { UptimeKumaStatusDraftConfig } from "../uptime-kuma-status";

export interface UptimeKumaIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function UptimeKumaStatusForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: UptimeKumaStatusDraftConfig;
  onChange: (config: UptimeKumaStatusDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly UptimeKumaIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Uptime Kuma lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Uptime Kuma</span>
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
