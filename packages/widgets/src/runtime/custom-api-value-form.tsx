"use client";
import type { CustomApiValueDraftConfig } from "../custom-api-value";

export interface CustomApiIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
  endpoints: readonly { key: string; label: string }[];
}

export function CustomApiValueForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: CustomApiValueDraftConfig;
  onChange: (config: CustomApiValueDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly CustomApiIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0)
    return <p role="status">Aucune intégration API personnalisée lisible</p>;
  const selected = integrations.find((item) => item.id === config.integrationId);
  const endpoints = selected?.endpoints ?? [];
  return (
    <div className="widget-custom-api-value-form">
      <label className="ui-field">
        <span className="ui-label">Intégration API</span>
        <select
          value={config.integrationId}
          onChange={(event) =>
            onChange({
              ...config,
              integrationId: event.target.value,
              endpointKey: "",
            })
          }
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
      <label className="ui-field">
        <span className="ui-label">Endpoint</span>
        <select
          value={config.endpointKey}
          onChange={(event) => onChange({ ...config, endpointKey: event.target.value })}
        >
          <option value="">Sélectionner…</option>
          {endpoints.map((endpoint) => (
            <option key={endpoint.key} value={endpoint.key}>
              {endpoint.label}
            </option>
          ))}
        </select>
      </label>
      <label className="ui-field">
        <span className="ui-label">Chemin JSON</span>
        <input
          value={config.jsonPath}
          maxLength={128}
          onChange={(event) => onChange({ ...config, jsonPath: event.target.value })}
        />
      </label>
      <label className="ui-field">
        <span className="ui-label">Affichage</span>
        <select
          value={config.display}
          onChange={(event) => {
            const value = event.target.value;
            const display =
              value === "number" || value === "badge" || value === "list" || value === "text"
                ? value
                : "text";
            onChange({ ...config, display });
          }}
        >
          <option value="text">Texte</option>
          <option value="number">Nombre</option>
          <option value="badge">Badge</option>
          <option value="list">Liste</option>
        </select>
      </label>
      <label className="ui-field">
        <span className="ui-label">Libellé (optionnel)</span>
        <input
          value={config.label ?? ""}
          maxLength={48}
          onChange={(event) => onChange({ ...config, label: event.target.value })}
        />
      </label>
      <label className="ui-field">
        <span className="ui-label">Unité (optionnelle)</span>
        <input
          value={config.unit ?? ""}
          maxLength={16}
          onChange={(event) => onChange({ ...config, unit: event.target.value })}
        />
      </label>
    </div>
  );
}
