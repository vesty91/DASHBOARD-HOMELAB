"use client";

import { useState } from "react";
import { Alert, ConfirmDialog } from "@dashboard/ui";
import {
  restartDockerContainerAction,
  startDockerContainerAction,
  stopDockerContainerAction,
} from "./docker-actions";
import type { DockerActionOutcome } from "./docker-action-result";
import { isDockerStartableState } from "./docker-container-state";

export function DockerContainerActions({
  integrationId,
  containerId,
  name,
  state,
  canStart,
  canStop,
  canRestart,
}: {
  integrationId: string;
  containerId: string;
  name: string;
  state: string;
  canStart: boolean;
  canStop: boolean;
  canRestart: boolean;
}) {
  const [pending, setPending] = useState<"stop" | "restart" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = state === "running";
  const startable = isDockerStartableState(state);

  async function runAction(action: () => Promise<DockerActionOutcome>) {
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
    <>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {canStart && startable ? (
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          disabled={busy}
          onClick={() =>
            void runAction(() => startDockerContainerAction(integrationId, containerId))
          }
        >
          Démarrer
        </button>
      ) : null}
      {canStop && running ? (
        <button type="button" className="ui-btn" disabled={busy} onClick={() => setPending("stop")}>
          Arrêter
        </button>
      ) : null}
      {canRestart && running ? (
        <button
          type="button"
          className="ui-btn"
          disabled={busy}
          onClick={() => setPending("restart")}
        >
          Redémarrer
        </button>
      ) : null}
      {pending === "stop" ? (
        <ConfirmDialog
          title={`Arrêter ${name} ?`}
          confirmLabel="Arrêter"
          onConfirm={() => {
            setPending(null);
            void runAction(() => stopDockerContainerAction(integrationId, containerId));
          }}
          onCancel={() => setPending(null)}
        >
          Cette action envoie un stop au conteneur via le socket proxy.
        </ConfirmDialog>
      ) : null}
      {pending === "restart" ? (
        <ConfirmDialog
          title={`Redémarrer ${name} ?`}
          confirmLabel="Redémarrer"
          onConfirm={() => {
            setPending(null);
            void runAction(() => restartDockerContainerAction(integrationId, containerId));
          }}
          onCancel={() => setPending(null)}
        >
          Cette action redémarre le conteneur via le socket proxy.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
