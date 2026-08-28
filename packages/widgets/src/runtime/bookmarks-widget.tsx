"use client";
import type { BookmarksConfig } from "../bookmarks";

function ExternalIcon() {
  return (
    <svg
      className="widget-external-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M14 5h5v5" />
      <path d="M10 14 19 5" />
      <path d="M19 13v6a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" />
    </svg>
  );
}

export function BookmarksWidget({ config }: { config: BookmarksConfig }) {
  if (config.links.length === 0) return <p role="status">Aucun signet</p>;
  return (
    <ul className="widget-bookmarks">
      {config.links.map((link) => (
        <li key={link.id}>
          {link.target === "new-tab" ? (
            <a href={link.url} target="_blank" rel="noopener noreferrer">
              {link.title}
              <ExternalIcon />
            </a>
          ) : (
            <a href={link.url}>{link.title}</a>
          )}
        </li>
      ))}
    </ul>
  );
}
