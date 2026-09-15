"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshCustomApiOverviewAction } from "./custom-api-actions";
import type { CustomApiActionOutcome } from "./custom-api-action-result";

export function CustomApiRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<CustomApiActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="custom-api-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshCustomApiOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
