import { requireServerPermission } from "@/lib/server/auth";
import { getDatabase } from "@/lib/server/database";
import { createGroupAction } from "./actions";
import { redirect } from "next/navigation";
export default async function GroupsPage() {
  if (!(await requireServerPermission("group.read").catch(() => null))) redirect("/login");
  const { authStore } = await getDatabase();
  const [groups, users] = await Promise.all([authStore.listGroups(), authStore.listUsers()]);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Groupes</h1>
      <form action={createGroupAction} className="my-6 grid gap-2 rounded border p-4">
        <input required name="name" placeholder="Nom" className="p-2 text-black" />
        <input name="description" placeholder="Description" className="p-2 text-black" />
        <select name="role" className="p-2 text-black">
          <option>VIEWER</option>
          <option>USER</option>
          <option>EDITOR</option>
          <option>ADMIN</option>
        </select>
        <select name="userId" className="p-2 text-black">
          <option value="">Sans membre initial</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.username}
            </option>
          ))}
        </select>
        <button>Créer le groupe</button>
      </form>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>{group.name}</li>
        ))}
      </ul>
    </main>
  );
}
