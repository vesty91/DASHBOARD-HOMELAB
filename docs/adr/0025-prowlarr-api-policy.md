# ADR 0025 — Prowlarr API policy

## Statut

Accepté pour la Phase 18.6 (Prowlarr).

## Contexte

Prowlarr expose une API HTTP officielle **v1** (pas v3). Les mutations
(commandes, recherche, édition d'indexeurs) sont hors scope. Un proxy générique,
une clé `apikey` en query string ou un chemin hors allowlist sont interdits.

Officiel : https://prowlarr.com/docs/api/

## Décisions

### 1. Package `@dashboard/prowlarr`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist GET uniquement

Uniquement :

- `GET /api/v1/system/status`
- `GET /api/v1/health`
- `GET /api/v1/indexer`
- `GET /api/v1/indexerstatus`

Aucun paramètre de query. `maxRetries: 0`, `maxRedirects: 0`. Corps borné
(256 KiB / 512 KiB listes). Un corps tronqué est `INVALID_RESPONSE`.

Interdit : POST/PUT/DELETE, `/api/v1/search`, `/api/v1/command`, chemins
arbitraires, iframe, proxy générique, `apikey` en query.

### 3. Auth header uniquement

Secret requis `apiKey` (ASCII visible 1–512, sans caractères de contrôle).
Header uniquement : `X-Api-Key: <key>` plus `Accept: application/json`.
Jamais query string, même si Prowlarr l'accepte.

`DENIED_QUERY_KEYS` : `apikey`, `api_key`, `access_token`, `token`,
`authorization`, `password`, `ticket`.

### 4. DTO borné

Jamais de JSON Prowlarr brut.

- `system/status` : `version` (64) et `appName` optionnel (32). Jamais
  `startupPath`, `appData`, `isAdmin`, `authentication`, `urlBase`,
  `instanceName`, chemins de base.
- `health` : compteurs `{ error, warning, notice, other }` depuis `type`.
  Cap 2000. Jamais `message`, `wikiUrl`, `source`.
- `indexer` : `{ count, enabledCount }` depuis le booléen `enable`. Cap 2000.
  Jamais noms, URLs, `apiKey`, mot de passe, catégories, détails de trackers
  privés.
- `indexerstatus` : `{ count }` (longueur du tableau). Cap 2000. Jamais noms
  d'indexeurs. 403/404 = section `unavailable` (pas de zéros inventés).

Si toutes les sections échouent, l'overview lève l'erreur de `system/status`.
Un 401 sur `system/status` échoue l'overview (`UNAUTHORIZED`).

### 5. Permissions

`prowlarr.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne
l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`prowlarr-status` : `publicSafe=false`. Capability : `status.read`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.

## Amendement Phase 21.5

Prowlarr **reste read-only**. Les écritures officielles (CRUD indexeurs,
`POST /api/v1/search`, `POST /api/v1/command`, test-all) ne sont pas des
actions ciblées non destructives utiles au dashboard. Aucune mutation n'est
ajoutée pour cocher une case.
