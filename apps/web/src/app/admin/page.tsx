import Link from "next/link";
import { LogoutButton } from "./logout-button";
export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-3xl font-semibold">Administration</h1>
      <nav className="my-8 flex gap-4">
        <Link href="/admin/users">Utilisateurs</Link>
        <Link href="/admin/groups">Groupes</Link>
        <Link href="/account/security">Sécurité</Link>
      </nav>
      <LogoutButton />
    </main>
  );
}
