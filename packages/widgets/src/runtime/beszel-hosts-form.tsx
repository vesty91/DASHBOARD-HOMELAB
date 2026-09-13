"use client";
import type { BeszelHostsDraftConfig } from "../beszel-hosts";

export interface BeszelIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function BeszelHostsForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: BeszelHostsDraftConfig;
  onChange: (config: BeszelHostsDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly BeszelIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration Beszel lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration Beszel</span>
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
