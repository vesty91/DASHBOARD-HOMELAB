"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@dashboard/ui";

export function LoginForm() {
  const [error, setError] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <form
      className="ui-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(false);
        setPending(true);
        const data = new FormData(event.currentTarget);
        const result = await signIn("credentials", {
          username: String(data.get("username")),
          password: String(data.get("password")),
          redirect: false,
          callbackUrl: "/admin",
        });
        setPending(false);
        if (result?.ok) location.assign(result.url ?? "/admin");
        else setError(true);
      }}
    >
      <Field label="Identifiant">
        <Input name="username" required autoComplete="username" />
      </Field>
      <Field label="Mot de passe">
        <Input name="password" type="password" required autoComplete="current-password" />
      </Field>
      {error ? <Alert tone="danger">Identifiant ou mot de passe invalide.</Alert> : null}
      <Button variant="primary" type="submit" disabled={pending}>
        Connexion
      </Button>
    </form>
  );
}
