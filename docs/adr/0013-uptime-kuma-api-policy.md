# ADR 0013 — Uptime Kuma API policy

## Statut

Accepté pour la Phase 12 (Uptime Kuma).

## Contexte

Uptime Kuma n'expose **aucune API REST officielle stable** pour le CRUD des
moniteurs. Socket.IO est documenté comme **interne** et non supporté pour les
tiers. Les surfaces `/api/push/*` (mutation) et `/api/status-page/*` (pages
publiques non authentifiées) sont hors modèle de menace de cet adapter.

La seule surface officielle authentifiée de lecture est `GET /metrics`
(exposition Prometheus). L'authentification est HTTP Basic : le nom
d'utilisateur est vide, le mot de passe est la clé API.
Officiel : `Authorization: Basic base64(":" + apiKey)`.

Métriques officielles (`server/prometheus.js`, louislam/uptime-kuma master) :

- `monitor_status` — 1=UP, 0=DOWN, 2=PENDING, 3=MAINTENANCE
- `monitor_response_time` — millisecondes ; `-1` = pas de ping
- `monitor_uptime_ratio` — 0.0–1.0, label `window` (`1d`, `30d`, `365d`)

Labels officiels : `monitor_id`, `monitor_name`, `monitor_type`,
`monitor_url`, `monitor_hostname`, `monitor_port`.

Les incidents ne sont **pas** disponibles sur `/metrics`. Cette limitation est
documentée ; l'adapter n'invente pas d'incidents.

## Décisions

### 1. Package `@dashboard/uptime-kuma`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations`. HTTP +
Zod. Aucune migration DB. `baseUrl` = origine http(s) uniquement.

### 2. Auth Basic côté serveur uniquement

La clé API (`apiKey`, ASCII visible U+0021–U+007E, 1–512) n'est jamais mise
dans l'URL, le query, un cookie, le navigateur, les logs ou un DTO. Le header
`Authorization` est construit côté serveur et rejeté s'il contient des
caractères de contrôle.

### 3. Allowlist lecture seule

Uniquement `GET /metrics`, sans query. `maxRetries: 0`, `maxRedirects: 0`.
Corps borné à 256 KiB. Maximum 200 moniteurs ; au-delà `truncated=true` et
overview `degraded`.

Interdit : Socket.IO, `/api/push/*`, `/api/status-page/*`, REST communautaire
reverse-engineered.

### 4. Parse Prometheus strict

Parseur maison (pas de dépendance lourde). Ignore commentaires HELP/TYPE.
Jointure par `monitor_id` sinon `monitor_name`. Statut inconnu =
`INVALID_RESPONSE`. Latence `-1` => `null`. Ratio `window=1d` uniquement,
converti en pourcent 0–100 s'il est fini et dans `[0,1]` ; une valeur déjà
0–100 est rejetée. `monitor_url`, `monitor_hostname`, `monitor_port` et labels
bruts ne sont jamais envoyés au navigateur.

### 5. Permissions

`uptime-kuma.read` en conjonction de `integration.use|manage`. ADMIN par
défaut ne l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`uptime-kuma-status` : `publicSafe=false`.

### 6. Cache

Overview 15 s si complet, 8 s si partiel, failures 15 s. Coalescer + fence.
Refresh 10/min. Clés runtime = integration ID canonique.

### 7. Santé

Tous les moniteurs `up` ou `maintenance` => `available`. Un `down` / `pending`
ou une liste tronquée => `degraded`. API / auth en échec => section
indisponible (erreur typée, pas de fake data). Un `down` réel n'est jamais
masqué. `maintenance` n'est pas un échec.

## Conséquences

Le navigateur ne contacte jamais Uptime Kuma. `uptimeKuma.integration.list`
pagine le store avant filtre. `integration.list` / `integration.get` omettent
`baseUrl` et la config sans `integration.manage`.
