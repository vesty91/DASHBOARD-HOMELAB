"use client";
import type { BoardMutationResult } from "./mutation-result";
import { Button, Field, Input, Select } from "@dashboard/ui";

export function BoardMetaForm({
  name,
  description,
  visibility,
  conflict,
  onSave,
}: {
  name: string;
  description: string;
  visibility: "private" | "authenticated" | "public";
  conflict: boolean;
  onSave: (input: {
    name: string;
    description: string;
    visibility: "private" | "authenticated" | "public";
  }) => Promise<BoardMutationResult<{ revision: number }>>;
}) {
  function submit(form: HTMLFormElement): void {
    if (conflict) return;
    const data = new FormData(form);
    void onSave({
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      visibility: String(data.get("visibility") ?? "private") as
        "private" | "authenticated" | "public",
    });
  }

  return (
    <form
      className="board-meta-form"
      method="post"
      onSubmit={(event) => {
        event.preventDefault();
        submit(event.currentTarget);
      }}
    >
      <Field label="Nom">
        <Input name="name" defaultValue={name} required maxLength={120} />
      </Field>
      <Field label="Description">
        <Input name="description" defaultValue={description} maxLength={1000} />
      </Field>
      <Field label="Visibilité">
        <Select name="visibility" defaultValue={visibility}>
          <option value="private">Privé</option>
          <option value="authenticated">Authentifié</option>
          <option value="public">Public</option>
        </Select>
      </Field>
      <Button
        variant="secondary"
        type="button"
        disabled={conflict}
        onClick={(event) => {
          const form = event.currentTarget.form;
          if (form) submit(form);
        }}
      >
        Enregistrer les métadonnées
      </Button>
    </form>
  );
}
