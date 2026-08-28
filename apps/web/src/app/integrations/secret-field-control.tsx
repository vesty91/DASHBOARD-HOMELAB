"use client";
import { useEffect, useState } from "react";
import { Button, Field, Input } from "@dashboard/ui";

export function SecretFieldControl({
  action,
  fieldKey,
  label,
  configured,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fieldKey: string;
  label: string;
  configured: boolean;
}) {
  const [value, setValue] = useState("");
  useEffect(() => {
    setValue("");
  }, [configured]);
  return (
    <form action={action} className="ui-form" style={{ marginTop: "1rem" }}>
      <input type="hidden" name="key" value={fieldKey} />
      <Field label={label}>
        <Input
          name="value"
          type="password"
          autoComplete="new-password"
          placeholder="••••••"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <p className="ui-muted">{configured ? "Configuré" : "Non configuré"}</p>
      <Button variant="secondary" type="submit">
        Enregistrer le secret
      </Button>
    </form>
  );
}
