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

# État Phase 6

Le package `@dashboard/widgets` expose un `WidgetRegistry` immuable après initialisation : `register` est refusé, et les metadata (`publicSafe`, tailles, `defaultConfig` JSON) sont gelées. `configSchema` et les fonctions de migration ne sont pas deep-freeze. Les IDs built-in persistants sont `clock`, `bookmarks` et `app-tile`, tous en version 1.

Le flux de config est : parse JSON → lookup → migrations in-memory → Zod → rendu. Une lecture ne mute pas la DB. Une version future produit `incompatible-version`. Une étape de migration qui lève une exception produit `invalid-config` (version théoriquement migrable, donnée/migration inutilisable) sans faire tomber le board. Un type inconnu n'est jamais `publicSafe`.

Clock est `publicSafe` et se met à jour localement via `Intl.DateTimeFormat`. Bookmarks et App Tile ne le sont pas. Bookmarks refuse `javascript:`, `data:`, `file:`, `blob:`, `ftp:` et les URLs avec credentials. Un nouveau lien commence avec une URL vide ; Zod refuse de la persister. App Tile lit le catalogue Apps Phase 5 via `app.read` et n'appelle jamais `app.test`. L'UI utilise un brouillon `appId=""` ; le `defaultConfig` du registry contient un UUID sentinelle non persistable ; l'API refuse ce sentinelle et exige une App réelle accessible.

Le runtime standardise les états `ready`, `loading`, `empty`, `error`, `stale`, `disconnected`, `permission-denied` et `configuration-missing`. Une exception React est isolée par widget et le boundary se réinitialise quand `item.id` / version / config changent. Une erreur locale de résolution App Tile n'affecte pas Clock ni les autres widgets. `widget.data` générique n'existe pas.
