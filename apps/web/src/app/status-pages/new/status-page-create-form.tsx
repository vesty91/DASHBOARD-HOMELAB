"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Textarea } from "@dashboard/ui";
import { createStatusPageAction } from "../actions";

export function StatusPageCreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");

  return (
    <form
      className="ui-form ui-form-wide ui-form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(() => {
          void (async () => {
            setError(null);
            const result = await createStatusPageAction({
              name: name.trim(),
              slug: slug.trim(),
              description: description.trim(),
              visibility: "private",
              enabled: true,
            });
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.push(`/status-pages/${result.id}`);
            router.refresh();
          })();
        });
      }}
    >
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="Nom">
        <Input
          name="name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          data-testid="status-page-name"
        />
      </Field>
      <Field label="Slug">
        <Input
          name="slug"
          required
          minLength={2}
          maxLength={64}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          value={slug}
          onChange={(event) => setSlug(event.target.value.toLowerCase())}
          placeholder="homelab-core"
          data-testid="status-page-slug"
        />
      </Field>
      <Field label="Description">
        <Textarea
          name="description"
          maxLength={1000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          data-testid="status-page-description"
        />
      </Field>
      <p className="ui-muted" data-testid="status-page-private-default">
        Visibilité initiale : privée. La publication publique se fait depuis la page de détail.
      </p>
      <Button type="submit" disabled={pending} data-testid="status-page-create-submit">
        {pending ? "Création…" : "Créer la status page"}
      </Button>
    </form>
  );
}
