"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
export function LoginForm() {
  const [error, setError] = useState(false);
  return (
    <form
      className="mt-8 grid gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(false);
        const data = new FormData(event.currentTarget);
        const result = await signIn("credentials", {
          username: String(data.get("username")),
          password: String(data.get("password")),
          redirect: false,
          callbackUrl: "/admin",
        });
        if (result?.ok) location.assign(result.url ?? "/admin");
        else setError(true);
      }}
    >
      <label>
        Identifiant
        <input name="username" required className="block w-full rounded border p-2 text-black" />
      </label>
      <label>
        Mot de passe
        <input
          name="password"
          type="password"
          required
          className="block w-full rounded border p-2 text-black"
        />
      </label>
      {error && <p role="alert">Identifiant ou mot de passe invalide.</p>}
      <button className="rounded bg-white p-2 text-black">Connexion</button>
    </form>
  );
}
