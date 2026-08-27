"use client";
import { useState } from "react";
import { updateBoardAction } from "./actions";

export function BoardMetaForm({
  boardId,
  revision,
  name,
  description,
  visibility,
}: {
  boardId: string;
  revision: number;
  name: string;
  description: string;
  visibility: "private" | "authenticated" | "public";
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      action={async (formData) => {
        setError(null);
        const result = await updateBoardAction(boardId, revision, formData);
        if (result.error) setError(result.error);
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
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">Enregistrer les métadonnées</button>
    </form>
  );
}
