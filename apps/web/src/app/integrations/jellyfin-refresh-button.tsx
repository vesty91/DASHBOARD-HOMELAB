"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { refreshJellyfinOverviewAction } from "./jellyfin-actions";
import type { JellyfinActionOutcome } from "./jellyfin-action-result";

export function JellyfinRefreshButton({ integrationId }: { integrationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<JellyfinActionOutcome>) {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (!result.ok) setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="jellyfin-toolbar">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshJellyfinOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
    </div>
  );
}
