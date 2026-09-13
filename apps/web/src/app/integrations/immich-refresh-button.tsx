"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { refreshImmichOverviewAction } from "./immich-actions";
import type { ImmichActionOutcome } from "./immich-action-result";

export function ImmichRefreshButton({ integrationId }: { integrationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<ImmichActionOutcome>) {
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
    <div className="immich-toolbar">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshImmichOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
    </div>
  );
}
