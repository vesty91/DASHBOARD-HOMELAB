"use client";

import { useState } from "react";
import { Alert, ConfirmDialog } from "@dashboard/ui";
import { refreshRadarrMovieAction, searchRadarrMovieAction } from "./radarr-actions";
import type { RadarrActionOutcome } from "./radarr-action-result";

function parsePositiveInt(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/u.test(raw.trim())) return null;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) return null;
  return value;
}

export function RadarrCommandForm({
  integrationId,
  canCommand,
}: {
  integrationId: string;
  canCommand: boolean;
}) {
  const [movieId, setMovieId] = useState("");
  const [pendingSearch, setPendingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canCommand) return null;

  async function run(action: () => Promise<RadarrActionOutcome>, okMessage: string) {
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

  const parsedMovieId = parsePositiveInt(movieId);

  return (
    <section className="radarr-commands">
      <h2>Commandes</h2>
      <p className="ui-muted">
        Saisissez un identifiant Radarr explicite. Pas de refresh global, pas de delete, pas de
        rename.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <label>
        ID film
        <input
          value={movieId}
          onChange={(event) => setMovieId(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <div className="radarr-toolbar">
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          disabled={busy}
          onClick={() => {
            if (parsedMovieId === null) {
              setError("Saisissez un ID film entier positif.");
              return;
            }
            void run(
              () => refreshRadarrMovieAction({ integrationId, movieId: parsedMovieId }),
              "Refresh film envoyé.",
            );
          }}
        >
          Actualiser le film
        </button>
        <button
          type="button"
          className="ui-btn"
          disabled={busy}
          onClick={() => setPendingSearch(true)}
        >
          Rechercher le film
        </button>
      </div>
      {pendingSearch ? (
        <ConfirmDialog
          title="Rechercher le film sélectionné ?"
          confirmLabel="Rechercher le film"
          onConfirm={() => {
            setPendingSearch(false);
            if (parsedMovieId === null) {
              setError("Saisissez un ID film entier positif.");
              return;
            }
            void run(
              () => searchRadarrMovieAction({ integrationId, movieId: parsedMovieId }),
              "Recherche film envoyée.",
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
