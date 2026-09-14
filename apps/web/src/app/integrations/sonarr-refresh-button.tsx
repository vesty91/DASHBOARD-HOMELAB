"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshSonarrOverviewAction } from "./sonarr-actions";
import type { SonarrActionOutcome } from "./sonarr-action-result";

export function SonarrRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<SonarrActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="sonarr-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshSonarrOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
