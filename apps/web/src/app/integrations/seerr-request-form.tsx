"use client";

import { useState } from "react";
import { Alert, ConfirmDialog } from "@dashboard/ui";
import { approveSeerrRequestAction, declineSeerrRequestAction } from "./seerr-actions";
import type { SeerrActionOutcome } from "./seerr-action-result";

function parsePositiveInt(raw: string): number | null {
  if (!/^[1-9][0-9]{0,9}$/u.test(raw.trim())) return null;
  const value = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) return null;
  return value;
}

export function SeerrRequestForm({
  integrationId,
  canManageRequests,
}: {
  integrationId: string;
  canManageRequests: boolean;
}) {
  const [requestId, setRequestId] = useState("");
  const [pendingDecline, setPendingDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canManageRequests) return null;

  async function run(action: () => Promise<SeerrActionOutcome>, okMessage: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await action();
      if (result.ok) setSuccess(okMessage);
      else setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  const parsedRequestId = parsePositiveInt(requestId);

  return (
    <section className="seerr-requests">
      <h2>Demandes</h2>
      <p className="ui-muted">
        Saisissez un identifiant de demande Seerr explicite. Pas de liste, pas de retry, pas de
        suppression.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <label>
        ID demande
        <input
          value={requestId}
          onChange={(event) => setRequestId(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <div className="seerr-toolbar">
        <button
          type="button"
          className="ui-btn ui-btn-primary"
          disabled={busy}
          onClick={() => {
            if (parsedRequestId === null) {
              setError("Saisissez un ID demande entier positif.");
              return;
            }
            void run(
              () => approveSeerrRequestAction({ integrationId, requestId: parsedRequestId }),
              "Demande approuvée.",
            );
          }}
        >
          Approuver
        </button>
        <button
          type="button"
          className="ui-btn"
          disabled={busy}
          onClick={() => setPendingDecline(true)}
        >
          Refuser
        </button>
      </div>
      {pendingDecline ? (
        <ConfirmDialog
          title="Refuser la demande sélectionnée ?"
          confirmLabel="Refuser"
          onConfirm={() => {
            setPendingDecline(false);
            if (parsedRequestId === null) {
              setError("Saisissez un ID demande entier positif.");
              return;
            }
            void run(
              () => declineSeerrRequestAction({ integrationId, requestId: parsedRequestId }),
              "Demande refusée.",
            );
          }}
          onCancel={() => setPendingDecline(false)}
        >
          Le refus est réversible côté Seerr, mais la demande ne sera plus en attente.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
