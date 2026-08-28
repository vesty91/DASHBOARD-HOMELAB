"use client";
import { useEffect, useState } from "react";

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
    <form action={action}>
      <input type="hidden" name="key" value={fieldKey} />
      <label>
        {label}{" "}
        <input
          name="value"
          type="password"
          autoComplete="new-password"
          placeholder="••••••"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <p>{configured ? "Configuré" : "Non configuré"}</p>
      <button type="submit">Enregistrer le secret</button>
    </form>
  );
}
