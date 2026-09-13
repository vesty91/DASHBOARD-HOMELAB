"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { refreshBeszelOverviewAction } from "./beszel-actions";
import type { BeszelActionOutcome } from "./beszel-action-result";

export function BeszelRefreshButton({ integrationId }: { integrationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<BeszelActionOutcome>) {
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
    <div className="beszel-toolbar">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshBeszelOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
    </div>
  );
}
