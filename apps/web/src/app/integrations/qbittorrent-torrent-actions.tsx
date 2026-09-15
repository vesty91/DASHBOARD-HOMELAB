"use client";

import { useState } from "react";
import { Alert, ConfirmDialog } from "@dashboard/ui";
import {
  pauseQbittorrentTorrentsAction,
  resumeQbittorrentTorrentsAction,
} from "./qbittorrent-actions";
import type { QbittorrentActionOutcome } from "./qbittorrent-action-result";

const HASH_PATTERN = /^[a-f0-9]{40}$|^[a-f0-9]{64}$/iu;
const HASH_MAX = 8;

function parseHashes(raw: string): string[] {
  const tokens = raw
    .split(/[\s,|]+/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const seen = new Set<string>();
  const hashes: string[] = [];
  for (const token of tokens) {
    if (!HASH_PATTERN.test(token)) continue;
    const normalized = token.toLocaleLowerCase("und");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    hashes.push(normalized);
    if (hashes.length >= HASH_MAX) break;
  }
  return hashes;
}

export function QbittorrentTorrentActions({
  integrationId,
  canPause,
  canResume,
}: {
  integrationId: string;
  canPause: boolean;
  canResume: boolean;
}) {
  const [rawHashes, setRawHashes] = useState("");
  const [pendingPause, setPendingPause] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canPause && !canResume) return null;

  function parsedInput() {
    return { integrationId, hashes: parseHashes(rawHashes) };
  }

  async function runAction(action: () => Promise<QbittorrentActionOutcome>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const hashes = parseHashes(rawHashes);
      if (hashes.length === 0) {
        setError("Saisissez un à huit hashs de torrents (40 ou 64 caractères hexadécimaux).");
        return;
      }
      const result = await action();
      if (result.ok) setMessage("Action qBittorrent envoyée.");
      else setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="qbittorrent-torrent-actions">
      <h2>Actions torrents</h2>
      <p className="ui-muted">
        Saisissez les hashs explicitement. Les noms de torrents ne sont pas listés. Pas
        d&apos;action globale « all ».
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      <label>
        Hashs
        <textarea
          value={rawHashes}
          onChange={(event) => setRawHashes(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          rows={4}
        />
      </label>
      <div className="qbittorrent-toolbar">
        {canPause ? (
          <button
            type="button"
            className="ui-btn"
            disabled={busy}
            onClick={() => setPendingPause(true)}
          >
            Mettre en pause
          </button>
        ) : null}
        {canResume ? (
          <button
            type="button"
            className="ui-btn ui-btn-primary"
            disabled={busy}
            onClick={() => void runAction(() => resumeQbittorrentTorrentsAction(parsedInput()))}
          >
            Reprendre
          </button>
        ) : null}
      </div>
      {pendingPause ? (
        <ConfirmDialog
          title="Mettre en pause les torrents sélectionnés ?"
          confirmLabel="Mettre en pause"
          onConfirm={() => {
            setPendingPause(false);
            void runAction(() => pauseQbittorrentTorrentsAction(parsedInput()));
          }}
          onCancel={() => setPendingPause(false)}
        >
          Seuls les hashs saisis sont envoyés. Aucun fichier n&apos;est supprimé.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
