"use client";

export type BookmarkLinkDraft = {
  id: string;
  title: string;
  url: string;
  target: "same-tab" | "new-tab";
};

export type BookmarksDraftConfig = { links: BookmarkLinkDraft[] };

export function createEmptyBookmarkLink(): BookmarkLinkDraft {
  return {
    id: crypto.randomUUID(),
    title: "",
    url: "",
    target: "new-tab",
  };
}

export function BookmarksForm({
  config,
  onChange,
}: {
  config: BookmarksDraftConfig;
  onChange: (config: BookmarksDraftConfig) => void;
}) {
  const update = (index: number, patch: Partial<BookmarkLinkDraft>) => {
    onChange({
      links: config.links.map((link, current) =>
        current === index ? { ...link, ...patch } : link,
      ),
    });
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = index + direction;
    if (next < 0 || next >= config.links.length) return;
    const links = [...config.links];
    const current = links[index];
    const swap = links[next];
    if (!current || !swap) return;
    links[index] = swap;
    links[next] = current;
    onChange({ links });
  };
  return (
    <fieldset>
      <legend>Signets</legend>
      {config.links.map((link, index) => (
        <fieldset key={link.id}>
          <legend>Lien {index + 1}</legend>
          <label>
            Titre
            <input
              value={link.title}
              maxLength={120}
              onChange={(event) => update(index, { title: event.target.value })}
              required
            />
          </label>
          <label>
            URL
            <input
              value={link.url}
              maxLength={2048}
              onChange={(event) => update(index, { url: event.target.value })}
              required
            />
          </label>
          <label>
            Ouverture
            <select
              value={link.target}
              onChange={(event) =>
                update(index, { target: event.target.value as BookmarkLinkDraft["target"] })
              }
            >
              <option value="same-tab">Même onglet</option>
              <option value="new-tab">Nouvel onglet</option>
            </select>
          </label>
          <button type="button" onClick={() => move(index, -1)} disabled={index === 0}>
            Monter
          </button>
          <button
            type="button"
            onClick={() => move(index, 1)}
            disabled={index === config.links.length - 1}
          >
            Descendre
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ links: config.links.filter((entry) => entry.id !== link.id) })
            }
          >
            Supprimer le lien
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={config.links.length >= 50}
        onClick={() => onChange({ links: [...config.links, createEmptyBookmarkLink()] })}
      >
        Ajouter un lien
      </button>
    </fieldset>
  );
}
