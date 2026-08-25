# 07 — Système de widgets

## 1. Contrat

Pseudo-type :

```ts
type WidgetDefinition<TConfig> = {
  id: string;
  version: number;
  name: string;
  description: string;
  category: string;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  maxSize?: { w: number; h: number };
  configSchema: ZodSchema<TConfig>;
  integration?: {
    required: boolean;
    supportedTypes: string[];
    capability?: string;
  };
  publicSafe: boolean;
  refresh?: {
    defaultMs: number;
    minMs: number;
  };
  component: React.ComponentType<WidgetProps<TConfig>>;
};
```

## 2. Registry

```ts
widgetRegistry.register(definition);
widgetRegistry.get(id);
widgetRegistry.list();
```

Une définition dupliquée est une erreur au démarrage/test.

## 3. Instance

La DB stocke :

- `widgetType` ;
- `widgetVersion` ;
- `configJson`.

Au chargement :

1. trouver définition ;
2. migrer config si ancienne ;
3. valider config ;
4. rendre.

## 4. Migration widget

Prévoir :

```ts
migrations: {
  1: config => ...
  2: config => ...
}
```

## 5. États UI obligatoires

Chaque widget gère :

- loading ;
- empty ;
- error ;
- stale ;
- disconnected ;
- permission denied ;
- configuration missing.

## 6. Data fetching

Ne pas mettre les secrets dans le composant.

Flux :

```text
Widget UI
 -> tRPC query
 -> permission check
 -> integration service
 -> adapter
 -> external API
```

## 7. Refresh

Le widget déclare un défaut.

Le serveur peut imposer un minimum.

Ne pas permettre `100 ms` sur une API NAS.

## 8. Cache key

Inclure :

- integration id ;
- operation ;
- paramètres normalisés.

## 9. Widgets V1 sans intégration

- Clock ;
- Bookmarks ;
- App Tile ;
- Static Text/Markdown éventuellement.

## 10. Widgets avec intégration

- Docker Containers ;
- Docker Stats ;
- Synology System ;
- Synology Storage ;
- Jellyfin Streams ;
- Immich Stats ;
- Beszel Systems ;
- Uptime Kuma ;
- Prometheus Query.

## 11. Custom API widget

Phase V2.

Sécurité :

- URL via intégration dédiée ;
- secrets server-side ;
- allowlist méthode ;
- JSONPath contrôlé ;
- taille réponse ;
- timeout ;
- pas de JS arbitraire.

## 12. Plugins tiers

Hors V1.

Ne pas exécuter de code plugin non fiable dans le process principal sans modèle de sandbox clair.

Commencer par des widgets compilés dans le monorepo.
