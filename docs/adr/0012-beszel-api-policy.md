# ADR 0012 — Beszel API policy

## Statut

Accepté pour la Phase 12 (Beszel).

## Contexte

Beszel expose une API PocketBase. La documentation officielle
(`https://beszel.dev/guide/rest-api`) définit l'auth
`POST /api/collections/users/auth-with-password` et la lecture
`GET /api/collections/systems/records`. Aucun SDK PocketBase n'est requis.
Les types officiels confirment `status` (`up` | `down` | `paused` | `pending`)
et les métriques `info.cpu`, `info.mp`, `info.dp`, `info.bb`.

## Décisions

### 1. Package `@dashboard/beszel`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations`. HTTP + Zod,
comme Immich. Aucune migration DB. `baseUrl` = origine http(s) uniquement.

### 2. Token éphémère

Auth `identity` + `password`. Le token PocketBase reste en mémoire de requête
uniquement. Jamais DB, DTO, logs, navigateur, query string ou cookie. Header
`Authorization: <token>` (ASCII visible U+0021–U+007E).

### 3. Allowlist lecture seule

Uniquement :

- `POST /api/collections/users/auth-with-password`
- `GET /api/collections/systems/records`

Pas de `systems.update` ni d'autre mutation. Pagination `perPage=50`, borne
100 pages. `truncated=true` si la borne est atteinte. `maxRetries: 0`,
`maxRedirects: 0`.

### 4. Métriques

CPU / RAM / disque = pourcentages finis 0–100 depuis `info.cpu` / `info.mp` /
`info.dp`. Réseau = `info.bb` seulement s'il s'agit d'un entier sûr ; sinon
`null`. Statuts inconnus = `INVALID_RESPONSE`. Aucune fake data.

### 5. Permissions

`beszel.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne
l'obtient pas. Widget `beszel-hosts` : `publicSafe=false`.

### 6. Cache

Overview 15 s si complet, 8 s si partiel, failures 15 s. Coalescer + fence.
Refresh 10/min. Clés runtime = integration ID canonique.

### 7. Santé

Tous les hôtes `up` ou `paused` => `available`. Un `down` / `pending` ou une
liste tronquée => `degraded`. API / auth en échec => `unavailable`. Un `down`
réel n'est jamais masqué.

## Conséquences

Le navigateur ne contacte jamais l'API Beszel. `beszel.integration.list`
pagine le store avant filtre. `integration.list` / `integration.get` omettent
`baseUrl` et la config sans `integration.manage`.
