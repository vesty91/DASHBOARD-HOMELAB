"use client";

import { useState } from "react";
import { Alert } from "@dashboard/ui";
import { publishNtfyAction } from "./ntfy-actions";
import type { NtfyActionOutcome } from "./ntfy-action-result";

const PRIORITIES = ["min", "low", "default", "high", "max"] as const;
type Priority = (typeof PRIORITIES)[number];

export function NtfyPublishForm({
  integrationId,
  canPublish,
}: {
  integrationId: string;
  canPublish: boolean;
}) {
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<Priority>("default");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!canPublish) return null;

  async function run(action: () => Promise<NtfyActionOutcome>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await action();
      if (result.ok) {
        setSuccess("Notification ntfy envoyée.");
        setMessage("");
      } else setError(result.message);
    } finally {
      setBusy(false);
    }
  }

  const parsedTags = tags
    .split(/[\s,]+/u)
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 5);

  return (
    <section className="ntfy-publish">
      <h2>Publication</h2>
      <p className="ui-muted">
        Topic, message, titre optionnel, priorité et tags bornés. Pas d&apos;actions HTTP, de click
        URL, de pièce jointe ni d&apos;e-mail.
      </p>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}
      <label>
        Topic
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </label>
      <label>
        Titre
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          autoComplete="off"
          disabled={busy}
        />
      </label>
      <label>
        Message
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={busy}
          rows={4}
        />
      </label>
      <label>
        Priorité
        <select
          value={priority}
          onChange={(event) => setPriority(event.target.value as Priority)}
          disabled={busy}
        >
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tags
        <input
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
        />
      </label>
      <button
        type="button"
        className="ui-btn ui-btn-primary"
        disabled={busy}
        onClick={() =>
          void run(() =>
            publishNtfyAction({
              integrationId,
              topic: topic.trim(),
              message,
              priority,
              ...(title.trim() === "" ? {} : { title: title.trim() }),
              ...(parsedTags.length === 0 ? {} : { tags: parsedTags }),
            }),
          )
        }
      >
        Publier
      </button>
    </section>
  );
}
