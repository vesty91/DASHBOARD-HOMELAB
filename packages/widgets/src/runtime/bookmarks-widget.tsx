"use client";
import type { BookmarksConfig } from "../bookmarks";

export function BookmarksWidget({ config }: { config: BookmarksConfig }) {
  if (config.links.length === 0) return <p role="status">Aucun signet</p>;
  return (
    <ul className="widget-bookmarks">
      {config.links.map((link) => (
        <li key={link.id}>
          {link.target === "new-tab" ? (
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              {link.title}
            </a>
          ) : (
            <a href={link.url}>{link.title}</a>
          )}
        </li>
      ))}
    </ul>
  );
}
