# ADR 0021 — Grafana API policy

## Statut

Accepté pour la Phase 18.2 (Grafana).

## Contexte

Grafana expose une API HTTP officielle. Grafana 13 déprécie `/api` au profit de
`/apis` mais ne la désactive pas : `/api` reste opératoire. Les mutations
(création de dashboards, requêtes datasource, write alerting) sont hors scope.
Un iframe, un proxy générique, `/api/ds/query` ou un token dans l'URL sont
interdits.

Officiel : https://grafana.com/docs/grafana/latest/developers/http_api/

## Décisions

### 1. Package `@dashboard/grafana`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist GET uniquement

Uniquement :

- `GET /api/health`
- `GET /api/search?type=dash-db&limit=100` (clés `type` et `limit` uniquement ;
  `type` doit être `dash-db` ; `limit` 1–100)
- `GET /api/folders?limit=100` (clé `limit` uniquement)
- `GET /api/prometheus/grafana/api/v1/alerts`
- `GET /api/datasources`

`maxRetries: 0`, `maxRedirects: 0`. Corps borné (256 KiB / 512 KiB listes).
Un corps tronqué est `INVALID_RESPONSE`.

Interdit : `/api/ds/query`, datasource proxy, chemins arbitraires, iframe,
POST/PUT/DELETE, PromQL, payloads d'alerte bruts.

### 3. Auth Bearer obligatoire

Secret requis `serviceAccountToken` (ASCII visible 1–512). Header uniquement :
`Authorization: Bearer <token>`. Jamais query string. Jamais optionnel.

### 4. DTO borné

Jamais de JSON Grafana brut. Pas d'URL de dashboard, pas de titres (comptage
uniquement), pas de noms de dossiers, pas de payloads d'alerte, pas de
`password` / `basicAuthPassword` / `secureJsonData` / `secureJsonFields` /
`url` / `user` / `database` / `jsonData` / `name` de datasource. Compteurs +
tallies de types de sources. Si alerts répond 403/404, la section est
`unavailable` (pas de zéros inventés). Secrets redacted.

### 5. Permissions

`grafana.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne
l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`grafana-status` : `publicSafe=false`. Capability : `status.read`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.
