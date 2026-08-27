import type { AppDto } from "@dashboard/apps";
export function AppForm({
  action,
  app,
}: {
  action: (formData: FormData) => void | Promise<void>;
  app?: AppDto;
}) {
  const health = app?.healthcheckConfig;
  return (
    <form action={action}>
      <label>
        Nom <input name="name" required maxLength={120} defaultValue={app?.name} />
      </label>
      <label>
        Description{" "}
        <textarea name="description" maxLength={1000} defaultValue={app?.description ?? ""} />
      </label>
      <label>
        URL <input name="url" type="url" required maxLength={2048} defaultValue={app?.url} />
      </label>
      <label>
        Icône (URL HTTP/HTTPS){" "}
        <input name="iconRef" type="url" maxLength={2048} defaultValue={app?.iconRef ?? ""} />
      </label>
      <label>
        Couleur{" "}
        <input
          name="color"
          pattern="#[0-9A-Fa-f]{6}"
          placeholder="#336699"
          defaultValue={app?.color ?? ""}
        />
      </label>
      <label>
        Tags séparés par des virgules <input name="tags" defaultValue={app?.tags.join(", ")} />
      </label>
      <label>
        Ouvrir dans{" "}
        <select name="target" defaultValue={app?.target ?? "new-tab"}>
          <option value="new-tab">Nouvel onglet</option>
          <option value="same-tab">Même onglet</option>
        </select>
      </label>
      <label>
        <input name="healthcheckEnabled" type="checkbox" defaultChecked={app?.healthcheckEnabled} />{" "}
        Healthcheck activé
      </label>
      <label>
        Health path <input name="healthPath" defaultValue={health?.path ?? "/"} />
      </label>
      <label>
        Méthode{" "}
        <select name="healthMethod" defaultValue={health?.method ?? "GET"}>
          <option>GET</option>
          <option>HEAD</option>
        </select>
      </label>
      <label>
        Timeout ms{" "}
        <input
          name="timeoutMs"
          type="number"
          min={500}
          max={10000}
          defaultValue={health?.timeoutMs ?? 5000}
        />
      </label>
      <label>
        Status minimum{" "}
        <input
          name="expectedStatusMin"
          type="number"
          min={100}
          max={599}
          defaultValue={health?.expectedStatusMin ?? 200}
        />
      </label>
      <label>
        Status maximum{" "}
        <input
          name="expectedStatusMax"
          type="number"
          min={100}
          max={599}
          defaultValue={health?.expectedStatusMax ?? 399}
        />
      </label>
      <button type="submit">Enregistrer</button>
    </form>
  );
}
