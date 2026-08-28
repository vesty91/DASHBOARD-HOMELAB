"use client";
import { useState } from "react";
import { Button, ConfirmDialog } from "@dashboard/ui";

export function DeleteAppControl({ action }: { action: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Supprimer
      </Button>
    );
  return (
    <ConfirmDialog
      title="Confirmer la suppression"
      onCancel={() => setConfirming(false)}
      onConfirm={() => void action()}
      confirmLabel="Supprimer définitivement"
    >
      <p>Supprimer définitivement cette App ?</p>
    </ConfirmDialog>
  );
}
