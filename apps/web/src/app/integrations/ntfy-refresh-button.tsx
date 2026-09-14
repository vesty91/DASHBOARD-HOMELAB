"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshNtfyOverviewAction } from "./ntfy-actions";
import type { NtfyActionOutcome } from "./ntfy-action-result";

export function NtfyRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<NtfyActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="ntfy-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshNtfyOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
