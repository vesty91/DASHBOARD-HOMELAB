# ADR 0011 — Immich API policy

## Statut

Accepté pour la Phase 11.

## Contexte

La Phase 11 ajoute l'adapter Immich. L'OpenAPI officielle (`immich-openapi-specs.json`)
définit `servers.url = /api` et l'authentification par header `x-api-key`. Les jobs sont
mutants (`POST /jobs`). Les payloads about/statistics exposent des champs privés (URLs,
commits, `usageByUser`, EXIF) hors scope dashboard.

## Décisions

### 1. Package `@dashboard/immich`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations`. HTTP + Zod, comme
Jellyfin. Aucune migration DB. `baseUrl` = origine http(s) uniquement.

### 2. Auth par header uniquement

La clé API voyage uniquement dans `x-api-key`. Jamais en query, jamais dans le navigateur,
les logs, les DTO ou un cache public. ASCII visible U+0021–U+007E (1–512).

### 3. Allowlist GET

Uniquement :

- `/api/server/ping`
- `/api/server/version`
- `/api/server/about` (projection `version` + `licensed` uniquement)
- `/api/server/storage` (octets bruts)
- `/api/server/statistics` (`photos` / `videos` / `usage` ; pas `usageByUser`)

Pas de jobs. `maxRetries: 0`, `maxRedirects: 0`, corps 64 KiB.

### 4. Permissions

`immich.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne l'obtient pas.
Widget `immich-stats` : `publicSafe=false`.

### 5. Cache

Overview 15 s si complet, 8 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.

## Conséquences

Une section cassée dégrade l'overview sans fake data. Le navigateur ne contacte jamais
l'API Immich. `immich.integration.list` pagine le store avant filtre.
