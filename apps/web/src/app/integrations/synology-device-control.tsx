"use client";

import { useState } from "react";
import { Alert, Button, Field, Input } from "@dashboard/ui";
import { clearSynologyDeviceAction, enrollSynologyDeviceAction } from "./synology-actions";
import type { SynologyActionOutcome } from "./synology-action-result";

export function SynologyDeviceControl({
  integrationId,
  deviceConfigured,
}: {
  integrationId: string;
  deviceConfigured: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<SynologyActionOutcome>) {
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
    <section className="synology-device">
      <h2>Appareil de confiance DSM</h2>
      <p className="ui-muted">
        Enregistrez un OTP transitoire pour créer un jeton d&apos;appareil stocké uniquement côté
        serveur. Oublier l&apos;appareil n&apos;efface que le jeton local.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="ui-muted">
        {deviceConfigured ? "Appareil de confiance configuré" : "Aucun appareil de confiance"}
      </p>
      <form
        className="ui-form"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          void run(() => enrollSynologyDeviceAction(integrationId, formData));
        }}
      >
        <Field label="Code OTP DSM">
          <Input
            name="otpCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            minLength={4}
            maxLength={8}
            required
            disabled={busy}
          />
        </Field>
        <Button variant="secondary" type="submit" disabled={busy}>
          Enregistrer l&apos;appareil de confiance
        </Button>
      </form>
      <Button
        variant="secondary"
        type="button"
        disabled={busy}
        onClick={() => run(() => clearSynologyDeviceAction(integrationId))}
      >
        Oublier l&apos;appareil de confiance
      </Button>
    </section>
  );
}
