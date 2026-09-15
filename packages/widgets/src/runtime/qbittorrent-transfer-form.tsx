"use client";
import type { QbittorrentTransferDraftConfig } from "../qbittorrent-transfer";

export interface QbittorrentIntegrationOption {
  id: string;
  name: string;
  enabled: boolean;
}

export function QbittorrentTransferForm({
  config,
  onChange,
  permissionDenied,
  integrations,
}: {
  config: QbittorrentTransferDraftConfig;
  onChange: (config: QbittorrentTransferDraftConfig) => void;
  permissionDenied?: boolean;
  integrations: readonly QbittorrentIntegrationOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  if (integrations.length === 0) return <p role="status">Aucune intégration qBittorrent lisible</p>;
  return (
    <label className="ui-field">
      <span className="ui-label">Intégration qBittorrent</span>
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
