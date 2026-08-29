"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AppLibraryCategory, AppLibraryView } from "@dashboard/app-library";
import { Badge, Card, CardBody, CardFooter, EmptyState, Input } from "@dashboard/ui";
import { AppIcon } from "../app-icon";

const CATEGORY_LABELS: Record<AppLibraryCategory, string> = {
  media: "Média",
  downloads: "Téléchargements",
  automation: "Automatisation",
  monitoring: "Monitoring",
  infrastructure: "Infrastructure",
  network: "Réseau",
  storage: "Stockage",
  security: "Sécurité",
  "home-automation": "Domotique",
  productivity: "Productivité",
  development: "Développement",
  other: "Autres",
};

function normalize(value: string): string {
  return value.trim().normalize("NFKC").toLocaleLowerCase("und");
}

export function LibraryBrowser({
  items,
  categories,
  canManage,
}: {
  items: readonly AppLibraryView[];
  categories: readonly AppLibraryCategory[];
  canManage: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AppLibraryCategory | "all">("all");
  const visible = useMemo(() => {
    const needle = normalize(query);
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (!needle) return true;
      return (
        normalize(item.name).includes(needle) ||
        normalize(item.description).includes(needle) ||
        item.tags.some((tag) => {
          const normalizedTag = normalize(tag);
          return normalizedTag.includes(needle) || needle.includes(normalizedTag);
        })
      );
    });
  }, [category, items, query]);

  return (
    <div className="library-browser">
      <div className="library-toolbar">
        <label className="ui-field library-search">
          <span className="ui-label">Rechercher</span>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jellyfin, monitoring, photos…"
          />
        </label>
        <div className="library-filters" role="tablist" aria-label="Catégories">
          <button
            type="button"
            role="tab"
            aria-selected={category === "all"}
            className={category === "all" ? "ui-btn ui-btn-primary" : "ui-btn"}
            onClick={() => setCategory("all")}
          >
            Toutes
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              className={category === item ? "ui-btn ui-btn-primary" : "ui-btn"}
              onClick={() => setCategory(item)}
            >
              {CATEGORY_LABELS[item]}
            </button>
          ))}
        </div>
      </div>
      <section className="card-grid library-grid">
        <Card className="entity-card">
          <CardBody>
            <div className="ui-card-header" style={{ padding: 0 }}>
              <span className="app-card-identity">
                <span className="app-card-icon">
                  <AppIcon src="/app-icons/generic-app.svg" name="Application personnalisée" />
                </span>
                <h2 className="ui-card-title">Application personnalisée</h2>
              </span>
              <Badge>Manuel</Badge>
            </div>
            <p className="ui-muted line-clamp-2">
              Créer une App sans modèle, avec votre URL et vos métadonnées.
            </p>
          </CardBody>
          <CardFooter>
            {canManage ? (
              <Link className="ui-btn ui-btn-primary" href="/apps/new">
                Ajouter manuellement
              </Link>
            ) : (
              <span className="ui-muted">Lecture seule</span>
            )}
          </CardFooter>
        </Card>
        {visible.map((item) => (
          <Card key={item.id} className="entity-card">
            <CardBody>
              <div className="ui-card-header" style={{ padding: 0 }}>
                <span className="app-card-identity">
                  <span className="app-card-icon">
                    <AppIcon src={item.icon.path} name={item.name} />
                  </span>
                  <h2 className="ui-card-title">{item.name}</h2>
                </span>
                <Badge>{CATEGORY_LABELS[item.category]}</Badge>
              </div>
              <p className="ui-muted line-clamp-2">{item.description}</p>
              <p className="ui-muted">{item.tags.slice(0, 4).join(" · ")}</p>
            </CardBody>
            <CardFooter>
              {canManage ? (
                <Link className="ui-btn ui-btn-primary" href={`/apps/new?template=${item.id}`}>
                  Ajouter
                </Link>
              ) : (
                <span className="ui-muted">Lecture seule</span>
              )}
            </CardFooter>
          </Card>
        ))}
      </section>
      {visible.length === 0 ? (
        <EmptyState title="Aucun résultat" description="Essayez un autre nom, tag ou catégorie." />
      ) : null}
    </div>
  );
}
