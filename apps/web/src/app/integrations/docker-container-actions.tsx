"use client";

import { useState } from "react";
import { ConfirmDialog } from "@dashboard/ui";
import {
  restartDockerContainerAction,
  startDockerContainerAction,
  stopDockerContainerAction,
} from "./docker-actions";

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
  const running = state === "running";
  return (
    <>
      {canStart && !running ? (
        <form action={startDockerContainerAction.bind(null, integrationId, containerId)}>
          <button type="submit" className="ui-btn ui-btn-primary">
            Démarrer
          </button>
        </form>
      ) : null}
      {canStop && running ? (
        <button type="button" className="ui-btn" onClick={() => setPending("stop")}>
          Arrêter
        </button>
      ) : null}
      {canRestart && running ? (
        <button type="button" className="ui-btn" onClick={() => setPending("restart")}>
          Redémarrer
        </button>
      ) : null}
      {pending === "stop" ? (
        <ConfirmDialog
          title={`Arrêter ${name} ?`}
          confirmLabel="Arrêter"
          confirmAction={stopDockerContainerAction.bind(null, integrationId, containerId)}
          onCancel={() => setPending(null)}
        >
          Cette action envoie un stop au conteneur via le socket proxy.
        </ConfirmDialog>
      ) : null}
      {pending === "restart" ? (
        <ConfirmDialog
          title={`Redémarrer ${name} ?`}
          confirmLabel="Redémarrer"
          confirmAction={restartDockerContainerAction.bind(null, integrationId, containerId)}
          onCancel={() => setPending(null)}
        >
          Cette action redémarre le conteneur via le socket proxy.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
