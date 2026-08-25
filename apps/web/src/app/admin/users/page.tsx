import { getDatabase } from "@/lib/server/database";
import { requireAdminPagePermission } from "@/lib/server/auth";
import { createUserAction, setStatusAction } from "./actions";
export default async function UsersPage() {
  await requireAdminPagePermission("user.read");
  const { authStore } = await getDatabase();
  const users = await authStore.listUsers();
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Utilisateurs</h1>
      <form action={createUserAction} className="my-6 grid gap-2 rounded border p-4">
        <h2>Créer un utilisateur local</h2>
        <input name="username" required placeholder="Identifiant" className="p-2 text-black" />
        <input name="displayName" placeholder="Nom affiché" className="p-2 text-black" />
        <input name="email" type="email" placeholder="Email" className="p-2 text-black" />
        <input
          name="password"
          type="password"
          minLength={12}
          required
          placeholder="Mot de passe initial"
          className="p-2 text-black"
        />
        <select name="role" className="p-2 text-black">
          <option>VIEWER</option>
          <option>USER</option>
          <option>EDITOR</option>
          <option>ADMIN</option>
        </select>
        <button>Créer</button>
      </form>
      <ul>
        {users.map((user) => (
          <li key={user.id} className="my-2">
            {user.username} — {user.status}
            <form action={setStatusAction} className="inline pl-3">
              <input type="hidden" name="userId" value={user.id} />
              <input
                type="hidden"
                name="status"
                value={user.status === "active" ? "disabled" : "active"}
              />
              <button className="underline">
                {user.status === "active" ? "Désactiver" : "Activer"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
