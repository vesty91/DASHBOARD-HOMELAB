"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshRadarrOverviewAction } from "./radarr-actions";
import type { RadarrActionOutcome } from "./radarr-action-result";

export function RadarrRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<RadarrActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="radarr-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshRadarrOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
