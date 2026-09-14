"use client";
import type { ProxmoxResourcesDraftConfig } from "../proxmox-resources";

export interface ProxmoxIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function ProxmoxResourcesForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: ProxmoxResourcesDraftConfig;
  onChange: (config: ProxmoxResourcesDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly ProxmoxIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Proxmox lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Proxmox</span>
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
