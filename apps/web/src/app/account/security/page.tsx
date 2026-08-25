import { redirect } from "next/navigation";
import { requireSession } from "@/lib/server/auth";
import { changePasswordAction } from "./actions";
export const dynamic = "force-dynamic";
export default async function SecurityPage() {
  if (!(await requireSession().catch(() => null))) redirect("/login");
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-3xl font-semibold">Sécurité du compte</h1>
      <form action={changePasswordAction} className="mt-8 grid gap-4">
        <label>
          Mot de passe actuel
          <input
            required
            type="password"
            name="currentPassword"
            className="block w-full rounded border p-2 text-black"
          />
        </label>
        <label>
          Nouveau mot de passe
          <input
            required
            minLength={12}
            maxLength={256}
            type="password"
            name="newPassword"
            className="block w-full rounded border p-2 text-black"
          />
        </label>
        <button className="rounded bg-white p-2 text-black">Changer le mot de passe</button>
      </form>
    </main>
  );
}
