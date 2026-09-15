"use client";

import { useState } from "react";
import { Alert, ConfirmDialog } from "@dashboard/ui";
import { refreshSonarrSeriesAction, searchSonarrEpisodeAction } from "./sonarr-actions";
import type { SonarrActionOutcome } from "./sonarr-action-result";

function parsePositiveInt(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/u.test(raw.trim())) return null;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) return null;
  return value;
}

export function SonarrCommandForm({
  integrationId,
  canCommand,
}: {
  integrationId: string;
  canCommand: boolean;
}) {
  const [seriesId, setSeriesId] = useState("");
  const [episodeId, setEpisodeId] = useState("");
  const [pendingSearch, setPendingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canCommand) return null;

  async function run(action: () => Promise<SonarrActionOutcome>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await action();
      if (result.ok) setSuccess(okMessage);
      else setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="sonarr-commands">
      <h2>Commandes</h2>
      <p className="ui-muted">
        Saisissez un identifiant Sonarr explicite. Pas de refresh global, pas de delete, pas de
        SeriesSearch.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <label>
        ID série
        <input
          value={seriesId}
          onChange={(event) => setSeriesId(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <button
        type="button"
        className="ui-btn ui-btn-primary"
        disabled={busy}
        onClick={() => {
          const id = parsePositiveInt(seriesId);
          if (id === null) {
            setError("Saisissez un ID série entier positif.");
            return;
          }
          void run(
            () => refreshSonarrSeriesAction({ integrationId, seriesId: id }),
            "Refresh série envoyé.",
          );
        }}
      >
        Actualiser la série
      </button>
      <label>
        ID épisode
        <input
          value={episodeId}
          onChange={(event) => setEpisodeId(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <button
        type="button"
        className="ui-btn"
        disabled={busy}
        onClick={() => setPendingSearch(true)}
      >
        Rechercher l&apos;épisode
      </button>
      {pendingSearch ? (
        <ConfirmDialog
          title="Rechercher l'épisode sélectionné ?"
          confirmLabel="Rechercher l'épisode"
          onConfirm={() => {
            setPendingSearch(false);
            const id = parsePositiveInt(episodeId);
            if (id === null) {
              setError("Saisissez un ID épisode entier positif.");
              return;
            }
            void run(
              () => searchSonarrEpisodeAction({ integrationId, episodeId: id }),
              "Recherche épisode envoyée.",
            );
          }}
          onCancel={() => setPendingSearch(false)}
        >
          Une recherche peut lancer un téléchargement. Aucun fichier existant n&apos;est supprimé.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
