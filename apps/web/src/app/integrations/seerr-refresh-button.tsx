"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshSeerrOverviewAction } from "./seerr-actions";
import type { SeerrActionOutcome } from "./seerr-action-result";

export function SeerrRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<SeerrActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="seerr-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshSeerrOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
