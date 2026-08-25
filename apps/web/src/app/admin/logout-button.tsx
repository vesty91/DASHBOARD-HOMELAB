"use client";
import { signOut } from "next-auth/react";
export function LogoutButton() {
  return (
    <button className="rounded border px-3 py-2" onClick={() => signOut({ callbackUrl: "/login" })}>
      Déconnexion
    </button>
  );
}
