"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { refreshSynologyOverviewAction } from "./synology-actions";
import type { SynologyActionOutcome } from "./synology-action-result";

export function SynologyRefreshButton({ integrationId }: { integrationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<SynologyActionOutcome>) {
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
    <div className="synology-toolbar">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshSynologyOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
    </div>
  );
}
