"use client";
import { useState } from "react";

export function DeleteBoardControl({ action }: { action: (formData: FormData) => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button type="button" onClick={() => setConfirming(true)}>
        Supprimer le board
      </button>
    );
  return (
    <section role="alertdialog" aria-labelledby="delete-board-title" aria-modal="true">
      <h2 id="delete-board-title">Supprimer ce board ?</h2>
      <p>Cette action est irréversible.</p>
      <button type="button" onClick={() => setConfirming(false)}>
        Annuler
      </button>
      <form action={action}>
        <button type="submit">Supprimer définitivement</button>
      </form>
    </section>
  );
}
