# ADR 0006 — Widget Engine: registry domaine/UI, migrations in-memory et projection publique

## Contexte

La Phase 6 introduit un registry de widgets, une validation de `configJson`, un versioning et une policy `publicSafe`. Le Board Engine existe déjà. Il ne faut ni cycle `boards <-> widgets`, ni exposer des fonctions React/Zod au catalogue, ni muter silencieusement la DB lors d'une lecture.

## Décisions

### 1. Séparation domaine / UI

`packages/widgets` exporte un contrat sans React (`WidgetContract`, registry, policy, schémas). Les composants et formulaires vivent dans `@dashboard/widgets/runtime`.

`packages/boards` ne dépend pas de `@dashboard/widgets`. Il consomme une interface étroite `BoardWidgetPolicy` injectée à la composition serveur (`apps/web` / `@dashboard/api`). Cela évite un cycle et empêche le domaine Board de tirer React.

### 2. Migrations de config in-memory

Une lecture applique les migrations séquentielles en mémoire, puis Zod. Aucun `UPDATE` n'est émis pendant un GET. La version et la config courantes sont persistées seulement lors d'une sauvegarde ultérieure (create/update item).

Une version stockée supérieure à la définition courante n'est pas devinée : état `incompatible-version`.

### 3. Projection publique par filtrage

Un board public n'est publiable que si tous les items sont connus, de version supportée, de config valide et `publicSafe`.

En lecture anonyme (ou sans `board.edit`) d'un board public, les items unsafe/inconnus/invalides et leurs placements sont omis. Le board reste lisible. Les `configJson` unsafe ne quittent pas le serveur.

Clock est `publicSafe`. Bookmarks et App Tile ne le sont pas : ils peuvent révéler des URLs ou une infrastructure interne.

## Conséquences

- Aucune migration DB Phase 6 : `title`, `config_json`, `widget_version` et les contraintes de layout existent depuis la Phase 2.
- Le catalogue tRPC n'expose ni composants, ni schémas Zod, ni fonctions de migration.
- `widget.data` générique n'est pas créé.
