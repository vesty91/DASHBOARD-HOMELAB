"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { refreshPrometheusOverviewAction } from "./prometheus-actions";
import type { PrometheusActionOutcome } from "./prometheus-action-result";

export function PrometheusRefreshButton({ integrationId }: { integrationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<PrometheusActionOutcome>) {
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
    <div className="prometheus-toolbar">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshPrometheusOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
    </div>
  );
}
