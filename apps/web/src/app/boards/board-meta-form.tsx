"use client";
import type { BoardMutationResult } from "./mutation-result";

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
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (conflict) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        void onSave({
          name: String(data.get("name") ?? ""),
          description: String(data.get("description") ?? ""),
          visibility: String(data.get("visibility") ?? "private") as
            "private" | "authenticated" | "public",
        });
      }}
    >
      <label>
        Nom <input name="name" defaultValue={name} required maxLength={120} />
      </label>
      <label>
        Description <textarea name="description" defaultValue={description} maxLength={1000} />
      </label>
      <label>
        Visibilité{" "}
        <select name="visibility" defaultValue={visibility}>
          <option value="private">Privé</option>
          <option value="authenticated">Authentifié</option>
          <option value="public">Public</option>
        </select>
      </label>
      <button type="submit" disabled={conflict}>
        Enregistrer les métadonnées
      </button>
    </form>
  );
}
