"use client";
import { signOut } from "next-auth/react";
import { revokeCurrentSessionAction } from "@/app/logout-action";

export function LogoutButton() {
  return (
    <button
      className="rounded border px-3 py-2"
      onClick={() => {
        void revokeCurrentSessionAction().finally(() => {
          void signOut({ callbackUrl: "/login" });
        });
      }}
    >
      Déconnexion
    </button>
  );
}
