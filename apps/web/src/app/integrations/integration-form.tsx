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
  const showJellyfinHelp = selectedType === "jellyfin";
  const showImmichHelp = selectedType === "immich";
  const showBeszelHelp = selectedType === "beszel";
  const showPrometheusHelp = selectedType === "prometheus";
  const showUptimeKumaHelp = selectedType === "uptime-kuma";
  const showProxmoxHelp = selectedType === "proxmox";
  const showGrafanaHelp = selectedType === "grafana";
  const showTrustedCa =
    showDockerHelp ||
    showSynologyHelp ||
    showJellyfinHelp ||
    showImmichHelp ||
    showBeszelHelp ||
    showPrometheusHelp ||
    showUptimeKumaHelp ||
    showProxmoxHelp ||
    showGrafanaHelp;
  const timeoutMs =
    typeof integration?.config.timeoutMs === "number" ? integration.config.timeoutMs : 8000;
  const trustedCaPem =
    typeof integration?.config.trustedCaPem === "string" ? integration.config.trustedCaPem : "";
  const account = typeof integration?.config.account === "string" ? integration.config.account : "";
  const identity =
    typeof integration?.config.identity === "string" ? integration.config.identity : "";
  return (
    <form action={action} className="ui-form ui-form-wide ui-form-grid">
      <Field label="Type">
        <Select
          name="type"
          required
          value={selectedType}
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
                : showJellyfinHelp
                  ? "https://jellyfin.example:8096"
                  : showImmichHelp
                    ? "https://immich.example:2283"
                    : showBeszelHelp
                      ? "https://beszel.example:8090"
                      : showPrometheusHelp
                        ? "http://prometheus.example:9090"
                        : showUptimeKumaHelp
                          ? "https://uptime.example:3001"
                          : showProxmoxHelp
                            ? "https://pve.example:8006"
                            : showGrafanaHelp
                              ? "https://grafana.example:3000"
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
      {showJellyfinHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Jellyfin. La clé API se configure ensuite comme
          secret serveur et n&apos;est jamais envoyée au navigateur.
        </Alert>
      ) : null}
      {showImmichHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Immich (origine uniquement, sans /api). La clé API
          se configure ensuite comme secret serveur et n&apos;est jamais envoyée au navigateur.
        </Alert>
      ) : null}
      {showBeszelHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Beszel (origine uniquement). L&apos;identifiant est
          stocké en configuration ; le mot de passe se configure ensuite comme secret serveur et
          n&apos;est jamais envoyé au navigateur.
        </Alert>
      ) : null}
      {showPrometheusHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Prometheus (origine uniquement). Le jeton Bearer
          est optionnel et se configure ensuite comme secret serveur ; il n&apos;est jamais envoyé
          au navigateur. Seuls POST /api/v1/query et /api/v1/query_range sont utilisés.
        </Alert>
      ) : null}
      {showUptimeKumaHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Uptime Kuma (origine uniquement). La clé API se
          configure ensuite comme secret serveur et n&apos;est jamais envoyée au navigateur. Seul
          GET /metrics est utilisé ; Socket.IO n&apos;est pas supporté.
        </Alert>
      ) : null}
      {showProxmoxHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Proxmox VE (origine uniquement, port 8006). Le
          jeton API se configure ensuite comme secret serveur et n&apos;est jamais envoyé au
          navigateur. Lecture seule : version, cluster/status et cluster/resources.
        </Alert>
      ) : null}
      {showGrafanaHelp ? (
        <Alert>
          Utilisez l&apos;URL HTTP(S) du serveur Grafana (origine uniquement). Le jeton de compte de
          service se configure ensuite comme secret serveur et n&apos;est jamais envoyé au
          navigateur. Lecture seule : santé, tableaux de bord, dossiers, alertes et sources.
        </Alert>
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
      {showBeszelHelp ? (
        <Field label="Identifiant Beszel">
          <Input
            name="identity"
            type="email"
            autoComplete="off"
            required
            maxLength={254}
            defaultValue={identity}
          />
        </Field>
      ) : null}
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
              : showJellyfinHelp
                ? "Utilisez ce champ pour un Jellyfin HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
                : showImmichHelp
                  ? "Utilisez ce champ pour un Immich HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
                  : showBeszelHelp
                    ? "Utilisez ce champ pour un Beszel HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
                    : showPrometheusHelp
                      ? "Utilisez ce champ pour un Prometheus HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
                      : showUptimeKumaHelp
                        ? "Utilisez ce champ pour un Uptime Kuma HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
                        : showGrafanaHelp
                          ? "Utilisez ce champ pour un Grafana HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
                          : showProxmoxHelp
                            ? "Utilisez ce champ pour un Proxmox HTTPS signé par une CA privée. Collez uniquement le certificat CA public, jamais une clé privée."
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
