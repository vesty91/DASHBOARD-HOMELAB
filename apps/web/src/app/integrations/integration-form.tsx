"use client";

import { useState } from "react";
import type { IntegrationCatalogEntry, IntegrationDto } from "@dashboard/integrations";
import { Alert, Button, Field, Input, Select, Textarea } from "@dashboard/ui";

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
  const [verifyTls, setVerifyTls] = useState(integration?.config.verifyTls !== false);
  const showDockerHelp = selectedType === "docker";
  const showSynologyHelp = selectedType === "synology";
  const showTrustedCa = showDockerHelp || showSynologyHelp;
  const timeoutMs =
    typeof integration?.config.timeoutMs === "number" ? integration.config.timeoutMs : 8000;
  const trustedCaPem =
    typeof integration?.config.trustedCaPem === "string" ? integration.config.trustedCaPem : "";
  const account = typeof integration?.config.account === "string" ? integration.config.account : "";
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
          placeholder={
            showDockerHelp
              ? "http://socket-proxy:2375"
              : showSynologyHelp
                ? "https://nas.example:5001"
                : undefined
          }
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
      {showSynologyHelp ? (
        <>
          <Alert>
            Utilisez l&apos;URL HTTPS de DSM (port 5001 par défaut). Le compte est stocké en
            configuration ; le mot de passe se configure ensuite comme secret serveur.
          </Alert>
          <Alert>
            Si DSM exige un OTP, enregistrez un appareil de confiance depuis la page de
            modification. Le jeton d&apos;appareil n&apos;est jamais affiché.
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
          <input
            name="verifyTls"
            type="checkbox"
            checked={verifyTls}
            onChange={(event) => setVerifyTls(event.target.checked)}
          />{" "}
          Vérifier TLS
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
      {showSynologyHelp ? (
        <Field label="Compte DSM">
          <Input
            name="account"
            autoComplete="off"
            required
            maxLength={128}
            defaultValue={account}
          />
        </Field>
      ) : null}
      {showTrustedCa ? (
        <Field
          label="CA de confiance (PEM, optionnel)"
          hint={
            showSynologyHelp
              ? "Utilisez ce champ pour un NAS HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
              : "Utilisez ce champ pour un proxy Docker HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
          }
        >
          <Textarea
            name="trustedCaPem"
            rows={8}
            disabled={!verifyTls}
            defaultValue={trustedCaPem}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
      ) : null}
      <Button variant="primary" type="submit">
        Enregistrer
      </Button>
    </form>
  );
}
