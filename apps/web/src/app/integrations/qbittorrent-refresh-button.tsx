"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshQbittorrentOverviewAction } from "./qbittorrent-actions";
import type { QbittorrentActionOutcome } from "./qbittorrent-action-result";

export function QbittorrentRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<QbittorrentActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="qbittorrent-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshQbittorrentOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
