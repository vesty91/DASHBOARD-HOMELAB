"use client";

import { useState } from "react";
import type { IntegrationCatalogEntry, IntegrationDto } from "@dashboard/integrations";
import { Alert, Button, Field, Input, Select } from "@dashboard/ui";

export function IntegrationForm({
  action,
  catalog,
  integration,
}: {
  action: (formData: FormData) => void | Promise<void>;
  catalog: readonly IntegrationCatalogEntry[];
  integration?: IntegrationDto;
}) {
  const [selectedType, setSelectedType] = useState(integration?.type ?? catalog[0]?.id ?? "");
  const showDockerHelp = selectedType === "docker";
  const verifyTls = integration?.config.verifyTls !== false;
  const timeoutMs =
    typeof integration?.config.timeoutMs === "number" ? integration.config.timeoutMs : 8000;
  return (
    <form action={action} className="ui-form ui-form-wide ui-form-grid">
      <Field label="Type">
        <Select
          name="type"
          required
          defaultValue={integration?.type ?? catalog[0]?.id ?? ""}
          disabled={Boolean(integration)}
          onChange={(event) => setSelectedType(event.target.value)}
        >
          {catalog.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.displayName}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Nom">
        <Input name="name" required maxLength={120} defaultValue={integration?.name ?? ""} />
      </Field>
      <Field label="URL de base">
        <Input
          name="baseUrl"
          type="url"
          required
          maxLength={2048}
          defaultValue={integration?.baseUrl ?? ""}
          placeholder={showDockerHelp ? "http://socket-proxy:2375" : undefined}
        />
      </Field>
      {showDockerHelp ? (
        <>
          <Alert>Utilisez l&apos;URL HTTP(S) interne de votre Docker Socket Proxy.</Alert>
          <Alert tone="warning">
            L&apos;accès au daemon Docker est hautement privilégié. Utilisez un socket proxy
            restreint et ne publiez pas son port.
          </Alert>
        </>
      ) : null}
      <label className="ui-field">
        <span className="ui-label">
          <input name="enabled" type="checkbox" defaultChecked={integration?.enabled ?? true} />{" "}
          Activée
        </span>
      </label>
      <label className="ui-field">
        <span className="ui-label">
          <input name="verifyTls" type="checkbox" defaultChecked={verifyTls} /> Vérifier TLS
        </span>
      </label>
      {!verifyTls ? (
        <Alert tone="warning">
          Vérification TLS désactivée pour cette intégration. Ce n&apos;est pas recommandé.
        </Alert>
      ) : null}
      <Field label="Timeout ms">
        <Input name="timeoutMs" type="number" min={500} max={30000} defaultValue={timeoutMs} />
      </Field>
      <Button variant="primary" type="submit">
        Enregistrer
      </Button>
    </form>
  );
}
