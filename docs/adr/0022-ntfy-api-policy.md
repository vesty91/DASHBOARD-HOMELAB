# ADR 0022 — ntfy API policy

## Statut

Accepté pour la Phase 18.3 (ntfy).

## Contexte

ntfy expose une API HTTP officielle. Un iframe, un proxy générique,
`/v1/config`, `/metrics` ou un token dans l'URL sont interdits. L'abonnement
topic, WebSocket et SSE restent hors scope. La publication ciblée `POST /{topic}`
est autorisée en Phase 21.4 (permission `ntfy.publish`).

Officiel : https://docs.ntfy.sh/config/#health-checks
Types : https://github.com/binwiederhier/ntfy/blob/master/server/types.go

## Décisions

### 1. Package `@dashboard/ntfy`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist

Uniquement :

- `GET /v1/health`
- `GET /v1/stats`
- `GET /v1/version`
- `POST /{topic}` (Phase 21.4) où `topic` est un segment strict, hors chemins
  réservés (`v1`, `metrics`, `config`, `account`, …)

Aucun paramètre de query. `maxRetries: 0`, `maxRedirects: 0`. Corps borné
(256 KiB). Un corps tronqué est `INVALID_RESPONSE`.

Interdit : subscribe/poll/websocket/SSE, `/v1/config`, `/metrics`,
`/v1/account`, chemins arbitraires, iframe, proxy générique, headers
`Actions` / `Click` / `Attach` / `Email`.

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

`ntfy.read` en conjonction de `integration.use|manage`. `ntfy.publish` en
conjonction de `integration.interact|manage`. ADMIN par défaut n'obtient ni
l'une ni l'autre. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`ntfy-status` : `publicSafe=false`. Capabilities : `status.read`,
`notifications.publish`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.

## Amendement Phase 21.4

Publication ciblée :

- `POST /{topic}` construit depuis un topic validé
- headers allowlistés : `Authorization` (si jeton), `Accept`, `Content-Type`,
  `Title`, `Priority`, `Tags`
- permission `ntfy.publish` + `integration.interact|manage`

Toujours interdit : Actions HTTP, Click URL, Attach, Email, headers arbitraires,
query, websocket/SSE.
