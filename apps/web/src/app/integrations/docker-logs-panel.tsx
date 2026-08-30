"use client";

import { useState } from "react";
import { Alert, Button } from "@dashboard/ui";
import { loadDockerLogsAction } from "./docker-actions";
import { dockerUserError } from "./docker-error";

export function DockerLogsPanel({
  integrationId,
  containerId,
}: {
  integrationId: string;
  containerId: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [tail, setTail] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function loadLogs() {
    setPending(true);
    setError(null);
    try {
      const result = await loadDockerLogsAction(integrationId, containerId, 200);
      setText(result.text);
      setTail(result.tail);
      setTruncated(result.truncated);
    } catch (caught) {
      setError(dockerUserError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="docker-logs">
      <Alert tone="warning">Les logs peuvent contenir des informations sensibles.</Alert>
      <Button type="button" onClick={() => void loadLogs()} disabled={pending}>
        {pending ? "Chargement…" : "Charger les logs"}
      </Button>
      {tail !== null ? (
        <p className="ui-muted">
          Dernières {tail} lignes{truncated ? " · tronqué" : ""}.
        </p>
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {text !== null ? <pre className="docker-log-output">{text || "(vide)"}</pre> : null}
    </section>
  );
}
