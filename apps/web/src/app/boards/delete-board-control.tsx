"use client";
import { useState } from "react";
import { Button, ConfirmDialog } from "@dashboard/ui";

export function DeleteBoardControl({ action }: { action: (formData: FormData) => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Supprimer le board
      </Button>
    );
  return (
    <ConfirmDialog
      title="Supprimer ce board ?"
      onCancel={() => setConfirming(false)}
      confirmAction={action}
      confirmLabel="Supprimer définitivement"
    >
      <p>Cette action est irréversible.</p>
    </ConfirmDialog>
  );
}
