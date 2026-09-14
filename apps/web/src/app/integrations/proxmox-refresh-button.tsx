"use client";

import { useState } from "react";
import { Button } from "@dashboard/ui";
import { refreshProxmoxOverviewAction } from "./proxmox-actions";
import type { ProxmoxActionOutcome } from "./proxmox-action-result";

export function ProxmoxRefreshButton({ integrationId }: { integrationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(action: () => Promise<ProxmoxActionOutcome>) {
    setBusy(true);
    setMessage(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="proxmox-toolbar">
      <Button
        type="button"
        disabled={busy}
        onClick={() => run(() => refreshProxmoxOverviewAction(integrationId))}
      >
        Actualiser
      </Button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
