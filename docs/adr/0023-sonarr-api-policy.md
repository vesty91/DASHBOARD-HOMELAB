# ADR 0023 — Sonarr API policy

## Statut

Accepté pour la Phase 18.4 (Sonarr).

## Contexte

Sonarr expose une API HTTP officielle v3. Un proxy générique, une clé
`apikey` en query string ou un chemin hors allowlist sont interdits. Grab/remove
de file et édition de séries restent hors scope. Les commandes ciblées
`RefreshSeries` et `EpisodeSearch` sont autorisées en Phase 21.5.

Officiel : https://sonarr.tv/docs/api/

## Décisions

### 1. Package `@dashboard/sonarr`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist

Uniquement :

- `GET /api/v3/system/status`
- `GET /api/v3/health`
- `GET /api/v3/queue/status`
- `GET /api/v3/series`
- `GET /api/v3/diskspace`
- `POST /api/v3/command` (Phase 21.5) avec corps allowlisté
  `{ name: "RefreshSeries", seriesId }` ou
  `{ name: "EpisodeSearch", episodeIds: [id] }`

Aucun paramètre de query. `maxRetries: 0`, `maxRedirects: 0`. Corps borné
(256 KiB / 512 KiB listes). Un corps tronqué est `INVALID_RESPONSE`.

Interdit : PUT/DELETE, GET `/api/v3/command`, queue grab/remove, SeriesSearch,
RssSync, chemins arbitraires, iframe, proxy générique, `apikey` en query.

### 3. Auth header uniquement

Secret requis `apiKey` (ASCII visible 1–512, sans caractères de contrôle).
Header uniquement : `X-Api-Key: <key>` plus `Accept: application/json`.
Jamais query string, même si Sonarr l'accepte.

`DENIED_QUERY_KEYS` : `apikey`, `api_key`, `access_token`, `token`,
`authorization`, `password`, `ticket`.

### 4. DTO borné

Jamais de JSON Sonarr brut.

- `system/status` : `version` (64) et `appName` optionnel (32). Jamais
  `startupPath`, `appData`, `isAdmin`, `authentication`, `urlBase`,
  `instanceName`, chemins de base.
- `health` : compteurs `{ error, warning, notice, other }` depuis `type`.
  Cap 2000. Jamais `message`, `wikiUrl`, `source`.
- `queue/status` : compteurs numériques existants uniquement. Pas de records
  ni titres. Les booléens officiels `errors`/`warnings` sont ignorés.
- `series` : `{ count, truncated }`. Cap 2000. Jamais titres, chemins, images.
- `diskspace` : `{ freeBytes, totalBytes }` agrégés. Cap 64 disques. Jamais
  `path` ni `label`. 403/404 = section `unavailable` (pas de zéros inventés).

Si toutes les sections échouent, l'overview lève l'erreur de `system/status`.
Un 401 sur `system/status` échoue l'overview (`UNAUTHORIZED`).

### 5. Permissions

`sonarr.read` en conjonction de `integration.use|manage`. `sonarr.command` en
conjonction de `integration.interact|manage`. ADMIN par défaut n'obtient ni
l'une ni l'autre. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`sonarr-overview` : `publicSafe=false`. Capabilities : `status.read`,
`command.queue`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.

## Amendement Phase 21.5

Commandes ciblées uniquement :

- `POST /api/v3/command` avec `RefreshSeries` + `seriesId` obligatoire
- `POST /api/v3/command` avec `EpisodeSearch` + un seul `episodeId`

Toujours interdit : SeriesSearch, SeasonSearch, RssSync, delete, settings,
commandes sans ID, GET command, query, `apikey` en query.
