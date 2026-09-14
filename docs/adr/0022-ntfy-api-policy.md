# ADR 0022 — ntfy API policy

## Statut

Accepté pour la Phase 18.3 (ntfy).

## Contexte

ntfy expose une API HTTP officielle. Les mutations (publication, abonnement
topic, WebSocket, SSE) sont hors scope. Un iframe, un proxy générique,
`/v1/config`, `/metrics` ou un token dans l'URL sont interdits.

Officiel : https://docs.ntfy.sh/config/#health-checks
Types : https://github.com/binwiederhier/ntfy/blob/master/server/types.go

## Décisions

### 1. Package `@dashboard/ntfy`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist GET uniquement

Uniquement :

- `GET /v1/health`
- `GET /v1/stats`
- `GET /v1/version`

Aucun paramètre de query. `maxRetries: 0`, `maxRedirects: 0`. Corps borné
(256 KiB). Un corps tronqué est `INVALID_RESPONSE`.

Interdit : POST publish, subscribe/poll/websocket/SSE, `/v1/config`, `/metrics`,
`/v1/account`, chemins arbitraires, iframe, proxy générique.

### 3. Auth Bearer optionnelle

Secret optionnel `accessToken` (ASCII visible 1–512 si présent). Si présent :
header uniquement `Authorization: Bearer <token>`. Si absent : aucun header
Authorization. Jamais query string. Jamais Basic username/password.

### 4. DTO borné

Jamais de JSON ntfy brut. Pas de noms de topics, pas de corps de messages, pas
de listes d'utilisateurs. Santé (`healthy`), compteurs publics (`messages`,
`messages_rate`) et version bornée. Si `/v1/version` répond 401/403/404, la
section est `unavailable` (pas de version inventée). Secrets redacted.

### 5. Permissions

`ntfy.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne
l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`ntfy-status` : `publicSafe=false`. Capability : `status.read`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.
