# ADR 0027 — Seerr API policy

## Statut

Accepté pour la Phase 18.8 (Seerr).

## Contexte

Seerr expose une API HTTP officielle **v1**. Jellyseerr et Overseerr partagent
cette API. Un seul package et un seul type d'intégration `seerr` couvrent les
trois produits. Les mutations (listes de demandes, retry, delete, settings) hors approve/decline
ciblés restent hors scope. Un proxy générique, une clé `apikey` en query string
ou un chemin hors allowlist sont interdits.

Officiel : https://docs.seerr.dev

## Décisions

### 1. Package `@dashboard/seerr`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment). Type d'intégration
uniquement `seerr` — pas de copies Jellyseerr/Overseerr.

### 2. Allowlist

Uniquement :

- `GET /api/v1/status`
- `GET /api/v1/request/count`
- `POST /api/v1/request/{id}/approve` (Phase 21.6)
- `POST /api/v1/request/{id}/decline` (Phase 21.6)

Aucun paramètre de query. `maxRetries: 0`, `maxRedirects: 0`. Corps JSON borné
(256 KiB). Un corps tronqué est `INVALID_RESPONSE`. Le JSON `MediaRequest`
n'est jamais parsé ni renvoyé.

Interdit : PUT/DELETE, retry, pending, POST `/api/v1/request`, GET listes,
chemins arbitraires, iframe, proxy générique, `apikey` en query.

### 3. Auth header uniquement

Secret requis `apiKey` (ASCII visible 1–512, sans caractères de contrôle).
Header uniquement : `X-Api-Key: <key>`. Jamais query string. Jamais navigateur.
Jamais logs.

`DENIED_QUERY_KEYS` : `apikey`, `api_key`, `access_token`, `token`,
`authorization`, `password`, `ticket`.

### 4. DTO borné

Jamais de JSON Seerr brut. Jamais utilisateurs, titres, ids TMDB, e-mails ni
listes de demandes.

- `status` : `{ version }` (64, secrets redactés). `compatibleProduct:
"seerr-family"` uniquement si `version` parse — ne pas inventer seerr vs
  jellyseerr vs overseerr.
- `request/count` : `pending`, `approved`, `processing`, `available` (entiers
  finis ≥ 0). `total` si présent et fini ≥ 0. Ignorer movie/tv/declined/completed
  sauf pour un total optionnel. Un 403/404 sur `/request/count` rend la section
  `unavailable` (pas de zéros inventés).

Un 401/403 sur `/status` échoue l'overview entier (`UNAUTHORIZED` /
`FORBIDDEN`).

### 5. Permissions

`seerr.read` en conjonction de `integration.use|manage`. `seerr.request.manage`
en conjonction de `integration.interact|manage`. ADMIN par défaut n'obtient ni
l'une ni l'autre. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`seerr-requests` : `publicSafe=false`. Capabilities : `status.read`,
`requests.manage`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.

## Amendement Phase 21.6

Approve / decline ciblés uniquement :

- `POST /api/v1/request/{id}/approve`
- `POST /api/v1/request/{id}/decline`

`{id}` est un entier 1..2_147_483_647. Le corps de réponse officiel n'est jamais
exposé. Toujours interdit : retry, pending, delete, création, listes, users,
settings.
