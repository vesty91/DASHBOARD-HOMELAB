"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshProwlarrOverviewAction } from "./prowlarr-actions";
import type { ProwlarrActionOutcome } from "./prowlarr-action-result";

export function ProwlarrRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<ProwlarrActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="prowlarr-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshProwlarrOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
