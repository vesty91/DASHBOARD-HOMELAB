"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshGrafanaOverviewAction } from "./grafana-actions";
import type { GrafanaActionOutcome } from "./grafana-action-result";

export function GrafanaRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<GrafanaActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="grafana-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshGrafanaOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
