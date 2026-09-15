"use client";
import {
  pruneServiceStatusSelectedIds,
  SERVICE_STATUS_SOURCE_TYPES,
  type ServiceStatusDraftConfig,
  type ServiceStatusSourceType,
} from "../service-status";

export interface ServiceStatusCatalogOption {
  id: string;
  name: string;
  sourceType: ServiceStatusSourceType;
}

const SOURCE_LABELS: Record<ServiceStatusSourceType, string> = {
  app: "Applications",
  docker: "Docker",
  synology: "Synology",
  jellyfin: "Jellyfin",
  immich: "Immich",
  beszel: "Beszel",
  "uptime-kuma": "Uptime Kuma",
  prometheus: "Prometheus",
  proxmox: "Proxmox",
  grafana: "Grafana",
  ntfy: "ntfy",
  prowlarr: "Prowlarr",
  radarr: "Radarr",
  sonarr: "Sonarr",
};

function toggleValue<T>(values: readonly T[], value: T, enabled: boolean): T[] {
  if (enabled) return values.includes(value) ? [...values] : [...values, value];
  return values.filter((entry) => entry !== value);
}

export function ServiceStatusForm({
  config,
  onChange,
  permissionDenied,
  catalog,
}: {
  config: ServiceStatusDraftConfig;
  onChange: (config: ServiceStatusDraftConfig) => void;
  permissionDenied?: boolean;
  catalog: readonly ServiceStatusCatalogOption[];
}) {
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  const availableSources = SERVICE_STATUS_SOURCE_TYPES.filter((source) =>
    catalog.some((entry) => entry.sourceType === source),
  );
  const visibleCatalog =
    config.selectedSources.length === 0
      ? catalog
      : catalog.filter((entry) => config.selectedSources.includes(entry.sourceType));
  return (
    <fieldset className="ui-field">
      <legend className="ui-label">Statut des services</legend>
      {availableSources.length === 0 ? (
        <p role="status">Aucun service lisible</p>
      ) : (
        <>
          <p className="ui-muted">Sources vides = toutes les sources autorisées.</p>
          {availableSources.map((source) => (
            <label key={source} className="ui-label">
              <input
                type="checkbox"
                checked={config.selectedSources.includes(source)}
                onChange={(event) => {
                  const selectedSources = toggleValue(
                    config.selectedSources,
                    source,
                    event.target.checked,
                  );
                  onChange({
                    ...config,
                    selectedSources,
                    selectedIds: pruneServiceStatusSelectedIds(config.selectedIds, selectedSources),
                  });
                }}
              />{" "}
              {SOURCE_LABELS[source]}
            </label>
          ))}
          <p className="ui-muted">Services vides = tous les services des sources retenues.</p>
          {visibleCatalog.map((entry) => (
            <label key={entry.id} className="ui-label">
              <input
                type="checkbox"
                checked={config.selectedIds.includes(entry.id)}
                onChange={(event) =>
                  onChange({
                    ...config,
                    selectedIds: toggleValue(config.selectedIds, entry.id, event.target.checked),
                  })
                }
              />{" "}
              {entry.name} · {SOURCE_LABELS[entry.sourceType]}
            </label>
          ))}
          <label className="ui-label">
            Affichage
            <select
              value={config.displayMode}
              onChange={(event) =>
                onChange({
                  ...config,
                  displayMode: event.target.value === "compact" ? "compact" : "list",
                })
              }
            >
              <option value="list">Liste</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <label className="ui-label">
            Nombre maximum
            <input
              type="number"
              min={1}
              max={24}
              value={config.maxItems}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                onChange({
                  ...config,
                  maxItems: Number.isFinite(parsed) ? parsed : config.maxItems,
                });
              }}
            />
          </label>
        </>
      )}
    </fieldset>
  );
}
