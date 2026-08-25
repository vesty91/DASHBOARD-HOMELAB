import { redirect } from "next/navigation";
import { getDatabase } from "@/lib/server/database";
import { setupAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function SetupPage() {
  const { authStore } = await getDatabase();
  if (await authStore.isOnboardingCompleted()) redirect("/login");
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-3xl font-semibold">Créer le premier administrateur</h1>
      <form action={setupAction} className="mt-8 grid gap-4">
        <label>
          Identifiant
          <input
            required
            minLength={3}
            maxLength={64}
            name="username"
            className="block w-full rounded border p-2 text-black"
          />
        </label>
        <label>
          Nom affiché
          <input
            maxLength={100}
            name="displayName"
            className="block w-full rounded border p-2 text-black"
          />
        </label>
        <label>
          Mot de passe
          <input
            required
            minLength={12}
            maxLength={256}
            type="password"
            name="password"
            className="block w-full rounded border p-2 text-black"
          />
        </label>
        <button className="rounded bg-white p-2 text-black" type="submit">
          Initialiser
        </button>
      </form>
    </main>
  );
}
