import type { IntegrationCatalogEntry, IntegrationDto } from "@dashboard/integrations";

export function IntegrationForm({
  action,
  catalog,
  integration,
}: {
  action: (formData: FormData) => void | Promise<void>;
  catalog: readonly IntegrationCatalogEntry[];
  integration?: IntegrationDto;
}) {
  const verifyTls = integration?.config.verifyTls !== false;
  const timeoutMs =
    typeof integration?.config.timeoutMs === "number" ? integration.config.timeoutMs : 8000;
  return (
    <form action={action}>
      <label>
        Type
        <select
          name="type"
          required
          defaultValue={integration?.type}
          disabled={Boolean(integration)}
        >
          {catalog.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Nom <input name="name" required maxLength={120} defaultValue={integration?.name} />
      </label>
      <label>
        URL de base{" "}
        <input
          name="baseUrl"
          type="url"
          required
          maxLength={2048}
          defaultValue={integration?.baseUrl}
        />
      </label>
      <label>
        <input name="enabled" type="checkbox" defaultChecked={integration?.enabled ?? true} />{" "}
        Activée
      </label>
      <label>
        <input name="verifyTls" type="checkbox" defaultChecked={verifyTls} /> Vérifier TLS
      </label>
      {!verifyTls && (
        <p role="alert">
          Vérification TLS désactivée pour cette intégration. Ce n&apos;est pas recommandé.
        </p>
      )}
      <label>
        Timeout ms{" "}
        <input name="timeoutMs" type="number" min={500} max={30000} defaultValue={timeoutMs} />
      </label>
      <button type="submit">Enregistrer</button>
    </form>
  );
}
