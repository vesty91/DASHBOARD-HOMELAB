"use client";
import { useEffect, useState } from "react";
import type { AppTileDraftConfig } from "../app-tile";

export interface AppOption {
  id: string;
  name: string;
}

export function AppTileForm({
  config,
  onChange,
  permissionDenied = false,
  loadApps,
}: {
  config: AppTileDraftConfig;
  onChange: (config: AppTileDraftConfig) => void;
  permissionDenied?: boolean;
  loadApps: (cursor?: string) => Promise<{
    items: AppOption[];
    nextCursor: string | null;
  }>;
}) {
  const [items, setItems] = useState<AppOption[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = async (cursor?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await loadApps(cursor);
      setItems((current) => (cursor ? [...current, ...page.items] : page.items));
      setNextCursor(page.nextCursor);
    } catch {
      setError("Permission insuffisante");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (permissionDenied) return;
    void load();
  }, [permissionDenied]);
  if (permissionDenied) return <p role="status">Permission insuffisante</p>;
  return (
    <fieldset>
      <legend>Tuile d'application</legend>
      {error ? <p role="alert">{error}</p> : null}
      <label>
        Application
        <select
          value={config.appId}
          onChange={(event) => onChange({ ...config, appId: event.target.value })}
          required
        >
          <option value="">Sélectionner une App</option>
          {items.map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </select>
      </label>
      {nextCursor ? (
        <button type="button" onClick={() => void load(nextCursor)} disabled={loading}>
          Charger plus d'Apps
        </button>
      ) : null}
      <label>
        <input
          type="checkbox"
          checked={config.showStatus}
          onChange={(event) => onChange({ ...config, showStatus: event.target.checked })}
        />{" "}
        Afficher le statut
      </label>
      <label>
        <input
          type="checkbox"
          checked={config.showLatency}
          onChange={(event) => onChange({ ...config, showLatency: event.target.checked })}
        />{" "}
        Afficher la latence
      </label>
    </fieldset>
  );
}
