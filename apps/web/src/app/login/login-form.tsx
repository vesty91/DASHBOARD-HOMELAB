"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Alert, Button, Field, Input } from "@dashboard/ui";
import { LOGIN_CREDENTIALS_FORM } from "./login-credentials-form";

const ERROR_MESSAGES: Record<string, string> = {
  oidc: "Connexion OpenID Connect impossible.",
  no_account: "Aucun compte local n'est associé à cette identité.",
  email_collision: "Cette adresse e-mail est déjà utilisée par un autre compte.",
  unverified_email: "L'adresse e-mail OpenID Connect n'est pas vérifiée.",
  credentials: "Identifiant ou mot de passe invalide.",
  CredentialsSignin: "Identifiant ou mot de passe invalide.",
  OAuthCallback: "Connexion OpenID Connect impossible.",
  OAuthSignin: "Connexion OpenID Connect impossible.",
  OAuthAccountNotLinked: "Cette identité OpenID Connect n'est pas associée à un compte.",
  AccessDenied: "Connexion OpenID Connect refusée.",
  Configuration: "OpenID Connect n'est pas configuré correctement.",
};

export function LoginForm({
  oidcEnabled,
  oidcDisplayName,
  allowLocalLogin,
  errorCode,
  passwordChanged,
  csrfToken,
}: {
  oidcEnabled: boolean;
  oidcDisplayName: string | null;
  allowLocalLogin: boolean;
  errorCode?: string;
  passwordChanged: boolean;
  csrfToken: string;
}) {
  const [error, setError] = useState(Boolean(errorCode && ERROR_MESSAGES[errorCode]));
  const [pending, setPending] = useState(false);
  const message =
    (errorCode && ERROR_MESSAGES[errorCode]) || (error ? ERROR_MESSAGES.credentials : null);
  return (
    <div className="ui-form">
      {passwordChanged ? (
        <Alert tone="success">Mot de passe mis à jour. Connectez-vous à nouveau.</Alert>
      ) : null}
      {message ? <Alert tone="danger">{message}</Alert> : null}
      {allowLocalLogin ? (
        <form
          className="ui-form"
          method={LOGIN_CREDENTIALS_FORM.method}
          action={LOGIN_CREDENTIALS_FORM.action}
          onSubmit={async (event) => {
            event.preventDefault();
            setError(false);
            setPending(true);
            const data = new FormData(event.currentTarget);
            const result = await signIn("credentials", {
              username: String(data.get("username")),
              password: String(data.get("password")),
              redirect: false,
              callbackUrl: LOGIN_CREDENTIALS_FORM.callbackUrl,
            });
            setPending(false);
            if (result?.ok) location.assign(LOGIN_CREDENTIALS_FORM.callbackUrl);
            else setError(true);
          }}
        >
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value={LOGIN_CREDENTIALS_FORM.callbackUrl} />
          <Field label="Identifiant">
            <Input name="username" required autoComplete="username" />
          </Field>
          <Field label="Mot de passe">
            <Input name="password" type="password" required autoComplete="current-password" />
          </Field>
          <Button variant="primary" type="submit" disabled={pending}>
            Connexion
          </Button>
        </form>
      ) : (
        <p className="ui-muted">Le login local est désactivé. Utilisez OpenID Connect.</p>
      )}
      {oidcEnabled ? (
        <Button
          variant="secondary"
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void signIn("oidc", { callbackUrl: LOGIN_CREDENTIALS_FORM.callbackUrl });
          }}
        >
          Continuer avec {oidcDisplayName ?? "OpenID Connect"}
        </Button>
      ) : null}
    </div>
  );
}
