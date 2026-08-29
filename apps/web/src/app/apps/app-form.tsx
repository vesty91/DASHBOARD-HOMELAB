"use client";

import { useState } from "react";
import type { AppDto } from "@dashboard/apps";
import type { AppLibraryView } from "@dashboard/app-library";
import { Button, Field, Input, Select, Textarea } from "@dashboard/ui";
import { AppIcon } from "./app-icon";

export function AppForm({
  action,
  app,
  template,
}: {
  action: (formData: FormData) => void | Promise<void>;
  app?: AppDto;
  template?: AppLibraryView;
}) {
  const initialLocalIcon =
    (app?.iconRef && app.iconRef.startsWith("/app-icons/") ? app.iconRef : null) ??
    template?.icon.path ??
    null;
  const [customIcon, setCustomIcon] = useState(!initialLocalIcon);
  const health = app?.healthcheckConfig;
  const suggestedHealth = template?.health?.suggestedPath ?? health?.path ?? "/";
  return (
    <form action={action} className="ui-form ui-form-wide ui-form-grid">
      <Field label="Nom">
        <Input
          name="name"
          required
          maxLength={120}
          defaultValue={app?.name ?? template?.name ?? ""}
        />
      </Field>
      <Field label="Description">
        <Textarea
          name="description"
          maxLength={1000}
          defaultValue={app?.description ?? template?.description ?? ""}
        />
      </Field>
      <Field
        label="URL"
        {...(template?.defaults?.urlPlaceholder
          ? { hint: `Port habituel : ${template.defaults.port}` }
          : {})}
      >
        <Input
          name="url"
          type="url"
          required
          maxLength={2048}
          defaultValue={app?.url ?? ""}
          placeholder={template?.defaults?.urlPlaceholder ?? "https://"}
        />
      </Field>
      {customIcon ? (
        <Field label="Icône personnalisée (URL HTTP/HTTPS)">
          <Input
            name="iconRef"
            maxLength={2048}
            defaultValue={app?.iconRef && !app.iconRef.startsWith("/app-icons/") ? app.iconRef : ""}
          />
        </Field>
      ) : (
        <div className="ui-field">
          <span className="ui-label">Icône</span>
          <div className="app-icon-preview">
            <span className="app-card-icon">
              <AppIcon src={initialLocalIcon} name={app?.name ?? template?.name ?? "Application"} />
            </span>
            <span>{template?.name ?? "Icône de la bibliothèque"}</span>
          </div>
          <input type="hidden" name="iconRef" value={initialLocalIcon ?? ""} />
          <Button type="button" variant="ghost" onClick={() => setCustomIcon(true)}>
            Utiliser une icône personnalisée
          </Button>
        </div>
      )}
      <Field label="Couleur">
        <Input
          name="color"
          pattern="#[0-9A-Fa-f]{6}"
          placeholder="#336699"
          defaultValue={app?.color ?? ""}
        />
      </Field>
      <Field label="Tags séparés par des virgules">
        <Input name="tags" defaultValue={(app?.tags ?? template?.tags ?? []).join(", ")} />
      </Field>
      <Field label="Ouvrir dans">
        <Select name="target" defaultValue={app?.target ?? template?.defaults?.target ?? "new-tab"}>
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
        <Input name="healthPath" defaultValue={suggestedHealth} />
      </Field>
      <Field label="Méthode">
        <Select
          name="healthMethod"
          defaultValue={health?.method ?? template?.health?.suggestedMethod ?? "GET"}
        >
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
