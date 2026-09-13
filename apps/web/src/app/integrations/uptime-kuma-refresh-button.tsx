"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { refreshUptimeKumaOverviewAction } from "./uptime-kuma-actions";
import type { UptimeKumaActionOutcome } from "./uptime-kuma-action-result";

export function UptimeKumaRefreshButton({ integrationId }: { integrationId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<UptimeKumaActionOutcome>) {
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
    <div className="uptime-kuma-toolbar">
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshUptimeKumaOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
    </div>
  );
}
