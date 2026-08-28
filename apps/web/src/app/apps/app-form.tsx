import type { AppDto } from "@dashboard/apps";
import { Button, Field, Input, Select, Textarea } from "@dashboard/ui";

export function AppForm({
  action,
  app,
}: {
  action: (formData: FormData) => void | Promise<void>;
  app?: AppDto;
}) {
  const health = app?.healthcheckConfig;
  return (
    <form action={action} className="ui-form ui-form-wide ui-form-grid">
      <Field label="Nom">
        <Input name="name" required maxLength={120} defaultValue={app?.name ?? ""} />
      </Field>
      <Field label="Description">
        <Textarea name="description" maxLength={1000} defaultValue={app?.description ?? ""} />
      </Field>
      <Field label="URL">
        <Input name="url" type="url" required maxLength={2048} defaultValue={app?.url ?? ""} />
      </Field>
      <Field label="Icône (URL HTTP/HTTPS)">
        <Input name="iconRef" type="url" maxLength={2048} defaultValue={app?.iconRef ?? ""} />
      </Field>
      <Field label="Couleur">
        <Input
          name="color"
          pattern="#[0-9A-Fa-f]{6}"
          placeholder="#336699"
          defaultValue={app?.color ?? ""}
        />
      </Field>
      <Field label="Tags séparés par des virgules">
        <Input name="tags" defaultValue={app?.tags?.join(", ") ?? ""} />
      </Field>
      <Field label="Ouvrir dans">
        <Select name="target" defaultValue={app?.target ?? "new-tab"}>
          <option value="new-tab">Nouvel onglet</option>
          <option value="same-tab">Même onglet</option>
        </Select>
      </Field>
      <label className="ui-field">
        <span className="ui-label">
          <input
            name="healthcheckEnabled"
            type="checkbox"
            defaultChecked={Boolean(app?.healthcheckEnabled)}
          />{" "}
          Healthcheck activé
        </span>
      </label>
      <Field label="Health path">
        <Input name="healthPath" defaultValue={health?.path ?? "/"} />
      </Field>
      <Field label="Méthode">
        <Select name="healthMethod" defaultValue={health?.method ?? "GET"}>
          <option>GET</option>
          <option>HEAD</option>
        </Select>
      </Field>
      <Field label="Timeout ms">
        <Input
          name="timeoutMs"
          type="number"
          min={500}
          max={10000}
          defaultValue={health?.timeoutMs ?? 5000}
        />
      </Field>
      <Field label="Status minimum">
        <Input
          name="expectedStatusMin"
          type="number"
          min={100}
          max={599}
          defaultValue={health?.expectedStatusMin ?? 200}
        />
      </Field>
      <Field label="Status maximum">
        <Input
          name="expectedStatusMax"
          type="number"
          min={100}
          max={599}
          defaultValue={health?.expectedStatusMax ?? 399}
        />
      </Field>
      <Button variant="primary" type="submit">
        Enregistrer
      </Button>
    </form>
  );
}
