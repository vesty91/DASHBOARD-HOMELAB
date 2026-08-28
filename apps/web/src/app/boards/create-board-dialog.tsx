"use client";

import { useState } from "react";
import { Button, Dialog, Field, Input } from "@dashboard/ui";
import { createBoardAction } from "./actions";

export function CreateBoardDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        Nouveau board
      </Button>
      <Dialog open={open} title="Nouveau board" onClose={() => setOpen(false)}>
        <form action={createBoardAction} className="ui-form">
          <Field label="Nom">
            <Input name="name" required maxLength={120} />
          </Field>
          <Field label="Slug">
            <Input name="slug" required maxLength={80} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" />
          </Field>
          <Field label="Description">
            <Input name="description" maxLength={1000} />
          </Field>
          <Button variant="primary" type="submit">
            Créer
          </Button>
        </form>
      </Dialog>
    </>
  );
}
