# ADR 0014 — Prometheus API policy

## Statut

Accepté pour la Phase 12 (Prometheus).

## Contexte

Prometheus expose une API HTTP officielle de requête. Les surfaces d'administration,
d'écriture, de labels/series et de statut ne font pas partie du modèle de menace de
cet adapter. Un proxy générique ou un GET qui place le PromQL dans l'URL est interdit.

Officiel : https://prometheus.io/docs/prometheus/latest/querying/api/

## Décisions

### 1. Package `@dashboard/prometheus`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist POST uniquement

Uniquement :

- `POST /api/v1/query`
- `POST /api/v1/query_range`

`Content-Type: application/x-www-form-urlencoded`. Le PromQL n'apparaît jamais dans
l'URL. `maxRetries: 0`, `maxRedirects: 0`. Corps borné à 256 KiB ; un corps tronqué
est `INVALID_RESPONSE`.

Interdit : GET query, `/api/v1/label/*`, series, targets, admin, config, status,
write, delete, proxy générique, PromQL navigateur, templates JS exécutables.

### 3. PromQL validé côté serveur

La config widget stocke `{ integrationId, query, mode, rangeSeconds?, stepSeconds? }`.
Les procédures `prometheus.query.instant` / `prometheus.query.range` revalident chaque
champ avant l'appel :

- query : 1–512, pas de caractères de contrôle, pas de saut de ligne ;
- instant : uniquement `query` + `timeout` ;
- range : `start` / `end` dérivés côté serveur depuis `now` et `rangeSeconds` ;
- rangeSeconds : 60–21600 ; stepSeconds : 15–3600 ; `range/step` ≤ 200 ;
- timeout Prometheus : 1–8 s ;
- DTO : 20 séries max (troncature `truncated=true` => `degraded`) ; > 50 séries
  brutes => `INVALID_RESPONSE` ; 2000 échantillons max.

Le navigateur n'envoie jamais une chaîne PromQL arbitraire à un endpoint générique
qui la transmet telle quelle. La page détail exécute uniquement la requête serveur
fixe `up`.

### 4. Auth Bearer optionnelle

Secret optionnel `bearerToken` (ASCII visible 1–512). S'il est présent :
`Authorization: Bearer <token>`. Sinon aucun header Authorization (défaut officiel).
Le jeton n'est jamais mis dans l'URL. Le header est rejeté s'il contient des
caractères de contrôle.

### 5. DTO borné

Jamais de JSON Prometheus brut. Labels allowlist : `__name__`, `job`, `instance`.
Valeurs de labels sanitizées (pas de contrôles, 128 caractères, secrets redacted).
Valeurs non finies (`NaN`, `±Inf`) => `null` avec horodatage conservé s'il est
valide. Horodatages : secondes Unix × 1000 => ms entier sûr.

### 6. Permissions

`prometheus.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne
l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`prometheus-metric` : `publicSafe=false`.

### 7. Cache

15 s si complet, 8 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.
Les procédures `query.instant` / `query.range` ont un budget séparé de 30 appels
par minute et par acteur+intégration, afin qu'une variation de PromQL ne puisse
pas saturer Prometheus. Les clés incluent un hash SHA-256 de la requête validée
(query + mode + range + step) et l'ID d'intégration canonique.

### 8. SSRF / TLS

Même pile que les autres adapters : `secureRequest`, schémas http/https, `verifyTls`,
`trustedCaPem`, pas de `rejectUnauthorized: false` global.

## Conséquences

Le navigateur ne contacte jamais Prometheus. `prometheus.integration.list` pagine
le store avant filtre. `integration.list` / `integration.get` omettent `baseUrl`
et la config sans `integration.manage`.
