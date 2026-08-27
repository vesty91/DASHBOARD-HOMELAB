"use client";
import { useState } from "react";
export function DeleteAppControl({ action }: { action: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button type="button" onClick={() => setConfirming(true)}>
        Supprimer
      </button>
    );
  return (
    <section role="alertdialog" aria-modal="true" aria-label="Confirmer la suppression">
      <p>Supprimer définitivement cette App ?</p>
      <button type="button" onClick={() => setConfirming(false)}>
        Annuler
      </button>
      <button type="button" onClick={() => void action()}>
        Supprimer définitivement
      </button>
    </section>
  );
}
