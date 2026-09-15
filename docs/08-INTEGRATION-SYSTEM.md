# 08 — Système d'intégrations

## 1. Définition

Pseudo-type :

```ts
type IntegrationDefinition<TConfig, TSecrets> = {
  id: string;
  displayName: string;
  version: number;
  configSchema: ZodSchema<TConfig>;
  secretSchema: ZodSchema<TSecrets>;
  capabilities: string[];
  createClient(ctx): IntegrationClient;
  testConnection(ctx): Promise<ConnectionResult>;
};
```

## 2. Config vs secrets

Config non sensible :

- baseUrl ;
- verifyTls ;
- timeout ;
- paramètres de comportement.

Secrets :

- apiKey ;
- token ;
- username/password si nécessaire ;
- clientSecret.

Les secrets d'une définition ne peuvent pas figurer dans `configFields` ni être persistés dans `configJson`.

Ne jamais mélanger les deux en DB.

## 3. Test de connexion

Retour normalisé :

```ts
type ConnectionResult =
  | { ok: true; latencyMs: number; metadata?: SafeMetadata }
  | { ok: false; code: IntegrationErrorCode; message: string };
```

## 4. Error codes

```text
UNAUTHORIZED
FORBIDDEN
TIMEOUT
DNS_ERROR
TLS_ERROR
UNREACHABLE
INVALID_RESPONSE
RATE_LIMITED
UNSUPPORTED_VERSION
MISCONFIGURED
NOT_FOUND
UNKNOWN
```

## 5. Base client

Fonctions communes :

- URL normalization ;
- timeout global avec deadline absolue (DNS, connect, TLS, headers, body) ;
- headers ;
- user-agent ;
- max body ;
- JSON parsing ;
- redaction par nom de clé et par valeur de secret connue ;
- TLS policy ;
- retries limités.

## 6. Retries

Retry seulement erreurs transitoires :

- timeout ;
- 429 selon Retry-After ;
- 502/503/504.

Pas de retry automatique :

- 401 ;
- 403 ;
- invalid config.

## 7. SSRF

Politique à implémenter.

Par défaut, une intégration admin peut cibler le LAN, puisque c'est un produit homelab.

Mais bloquer systématiquement :

- `file://` ;
- protocoles non HTTP(S), sauf adapter spécialisé ;
- loopback, link-local, multicast ;
- metadata cloud connues, y compris `169.254.169.254`, `100.100.100.200` (Alibaba) et `fd00:ec2::254` (AWS IMDS IPv6), ainsi que leurs formes IPv4-mapped ;
- redirections vers protocoles interdits.

Le CGNAT `100.64/10` et l'ULA IPv6 restent autorisés, sauf ces endpoints metadata explicitement interdits.

Documenter le risque d'un utilisateur ayant `integration.manage`.

## 8. TLS

Options :

- verify système par défaut ;
- certificat custom de confiance (`trustedCaPem`, certificat CA public uniquement) ;
- mode insecure uniquement si explicitement activé par admin avec warning.

Un certificat CA public n'est pas traité comme un secret. Les clés privées ne sont jamais
acceptées. `trustedCaPem` est stocké dans `integrations.configJson`, pas dans
`integration_secrets`. La validation de chaîne, d'expiration et de hostname reste active.
`trustedCaPem` est incompatible avec `verifyTls=false`. Le trust custom est local à la
requête : jamais `NODE_TLS_REJECT_UNAUTHORIZED`, jamais `https.globalAgent`.

Ne jamais désactiver TLS globalement.

## 9. Capabilities

Exemples :

### Docker

```text
containers.read
containers.stats
containers.logs
containers.start
containers.stop
containers.restart
```

### Jellyfin

```text
server.read
sessions.read
streams.read
```

### Immich

```text
server.read
stats.read
storage.read
```

### Synology

```text
system.read
storage.read
disks.read
```

### Prometheus

```text
query.read
```

## 10. Permissions

Le widget demande une capability.

Le serveur vérifie :

1. permission utilisateur sur intégration ;
2. capability disponible ;
3. config valide.

## 11. Version API

Chaque adapter doit tolérer :

- champs absents ;
- versions différentes ;
- erreurs inattendues.

Réponses externes toujours validées/normalisées.

# État Phase 7

Le package `@dashboard/integrations` implémente `IntegrationDefinition`, `IntegrationRegistry`,
capabilities, client HTTP sécurisé, cache mémoire, rate limiter de test et `IntegrationService`.
Le registry générique `createProductionIntegrationRegistry()` reste vide et gelé. Les secrets sont
chiffrés par `@dashboard/secrets`. Le test de connexion bypasse le cache, snapshot `configRevision`,
et ignore un résultat stale. Voir ADR 0007.

## 12. Intégration Docker

Statut : COMPLETE / merged (PR #10), tag `phase-8-complete`.

Premier adapter de production. Composé dans `apps/web` (`createApplicationIntegrationRegistry`),
jamais importé par `@dashboard/integrations`. Voir ADR 0008.

Transport Phase 8 :

- HTTP(S) vers un Docker Socket Proxy restreint.

Différé :

- Unix socket direct ;
- Docker TCP/TLS client-cert ;
- Docker SSH.

Capabilities implémentées :

```text
containers.read
containers.stats
containers.logs
containers.start
containers.stop
containers.restart
```

`docker.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Docker
(`integration.use|manage` + `docker.read|manage`). `integration.read` n'est pas requis pour
ouvrir `/integrations/[id]` d'une intégration Docker. La projection n'inclut pas `baseUrl`,
`config`, `trustedCaPem`, secrets ni `configRevision`.

Pas d'inventaire `GET /images/json`. Pas de generic invoke. Pas de widget Docker dans cette phase.

## 13. Synology

Statut : COMPLETE / merged (PR #11), tag `phase-9-complete`.

Adapter `synology` composé dans `apps/web`. Transport HTTP(S) vers l'origine DSM.
Login POST hors URL. Allowlist CGI `entry.cgi` uniquement. Voir ADR 0009.

Capabilities :

```text
system.read
resources.read
storage.read
```

`synology.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Synology
(`integration.use|manage` + `synology.read`). `integration.read` n'est pas requis.
La projection n'inclut pas `baseUrl`, `config`, `trustedCaPem`, secrets ni `configRevision`.
`integration.list` / `integration.get` omettent aussi `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `synology` pour tout acteur sans `integration.manage`.

2FA : OTP transitoire + `deviceId` server-managed. Pas d'action destructive. Pas de widget
Synology. Refresh manuel 10/min. Cache overview 15 s (5 s si partiel).

## 14. Jellyfin

Statut sur la branche `phase-10-jellyfin` : IMPLEMENTED / REVIEW.

Adapter `jellyfin` composé dans `apps/web`. Transport HTTP(S) vers l'origine Jellyfin.
Auth `X-Emby-Token` uniquement. Allowlist `GET /System/Info` et `GET /Sessions`. Voir ADR 0010.

Capabilities :

```text
server.read
sessions.read
streams.read
```

`jellyfin.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Jellyfin
(`integration.use|manage` + `jellyfin.read`). `integration.read` n'est pas requis.
`integration.list` / `integration.get` omettent `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `jellyfin` sans `integration.manage`.

Widget `jellyfin-sessions` : `publicSafe=false`. Refresh manuel 10/min. Cache overview 8 s
(5 s si partiel). Aucune fake data. Pas de SDK officiel.

## 15. Immich

Statut sur la branche `phase-11-immich` : IMPLEMENTED / REVIEW.

Adapter `immich` composé dans `apps/web`. Transport HTTP(S) vers l'origine Immich.
Auth `x-api-key` uniquement. Allowlist GET `/api/server/ping`, `/api/server/version`,
`/api/server/about`, `/api/server/storage`, `/api/server/statistics`. Voir ADR 0011.

`immich.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Immich
(`integration.use|manage` + `immich.read`). `integration.read` n'est pas requis.
`integration.list` / `integration.get` omettent `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `immich` sans `integration.manage`.

Widget `immich-stats` : `publicSafe=false`. Refresh manuel 10/min. Cache overview 15 s
(8 s si partiel). Aucune fake data. Pas d'EXIF, chemins, thumbnails ni `usageByUser`.

## 16. Beszel

Statut sur la branche `phase-12-beszel` : IMPLEMENTED / REVIEW.

Adapter `beszel` composé dans `apps/web`. Transport HTTP(S) vers l'origine Beszel.
Auth PocketBase `POST /api/collections/users/auth-with-password`. Lecture paginée
`GET /api/collections/systems/records`. Voir ADR 0012.

`beszel.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Beszel
(`integration.use|manage` + `beszel.read`). `integration.read` n'est pas requis.
`integration.list` / `integration.get` omettent `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `beszel` sans `integration.manage`.

Widget `beszel-hosts` : `publicSafe=false`. Refresh manuel 10/min. Cache overview 15 s
(8 s si partiel). Token jamais persisté. Aucune mutation. Aucune fake data.

## 17. Uptime Kuma

Statut sur la branche `phase-12-uptime-kuma` : IMPLEMENTED / REVIEW.

Adapter `uptime-kuma` composé dans `apps/web`. Transport HTTP(S) vers l'origine
Uptime Kuma. Auth HTTP Basic officielle (`Authorization: Basic base64(":" + apiKey)`).
Lecture seule `GET /metrics`. Voir ADR 0013. Socket.IO, `/api/push/*` et
`/api/status-page/*` sont hors scope. Les incidents ne sont pas exposés par `/metrics`.

`uptimeKuma.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Uptime Kuma (`integration.use|manage` + `uptime-kuma.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `uptime-kuma` sans
`integration.manage`.

Widget `uptime-kuma-status` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 15 s (8 s si partiel). Clé API jamais renvoyée. Aucune mutation. Aucune
fake data. `monitor_url` / hostname / port jamais exposés au navigateur.

## 18. Prometheus

Statut : COMPLETE / merged (PR #16).

Adapter `prometheus` composé dans `apps/web`. Transport HTTP(S) vers l'origine
Prometheus. Auth Bearer optionnelle (`Authorization: Bearer <token>`). Lecture seule
`POST /api/v1/query` et `POST /api/v1/query_range` (form-urlencoded). Voir ADR 0014.
GET query, labels/series, admin, write et proxy générique sont hors scope.

`prometheus.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Prometheus (`integration.use|manage` + `prometheus.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `prometheus` sans
`integration.manage`.

Widget `prometheus-metric` : `publicSafe=false`. Refresh manuel 10/min. Cache
15 s (8 s si partiel). PromQL revalidé côté serveur (longueur, contrôles, plage,
pas, volume). Jeton jamais renvoyé. Aucune mutation. Aucune fake data. Labels hors
`__name__` / `job` / `instance` jamais exposés. La page détail n'accepte pas de
requête depuis l'URL : requête serveur fixe `up`.

## 18.1. Proxmox VE

Statut : COMPLETE (Phase 18.1).

Adapter `proxmox` composé dans `apps/web`. Transport HTTP(S) vers l'origine Proxmox VE.
Auth token officielle (`Authorization: PVEAPIToken=<USER@REALM!TOKENID=SECRET>`).
Lecture seule `GET /api2/json/version`, `GET /api2/json/cluster/status`,
`GET /api2/json/cluster/resources`. Voir ADR 0020. Mutations VM/CT, snapshots,
migrations, login ticket et proxy générique sont hors scope.

`proxmox.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Proxmox (`integration.use|manage` + `proxmox.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `proxmox` sans
`integration.manage`.

Widget `proxmox-resources` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Jeton jamais renvoyé. Aucune mutation. Aucune
fake data. Noms de VM/CT, chemins storage et IP de nœuds jamais exposés au
widget.

## 18.2. Grafana

Statut : COMPLETE (Phase 18.2).

Adapter `grafana` composé dans `apps/web`. Transport HTTP(S) vers l'origine Grafana.
Auth Bearer obligatoire (`Authorization: Bearer <serviceAccountToken>`).
Lecture seule `GET /api/health`, `GET /api/search?type=dash-db&limit=100`,
`GET /api/folders?limit=100`, `GET /api/prometheus/grafana/api/v1/alerts`,
`GET /api/datasources`. Voir ADR 0021. Grafana 13 déprécie `/api` sans le
désactiver. Iframe, `/api/ds/query`, datasource proxy et chemins arbitraires
sont hors scope.

`grafana.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Grafana (`integration.use|manage` + `grafana.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `grafana` sans
`integration.manage`.

Widget `grafana-status` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Jeton jamais renvoyé. Aucune mutation. Aucune
fake data. Titres de dashboards, noms de dossiers, URLs, payloads d'alertes et
secrets de datasources jamais exposés. Un 403/404 sur les alertes rend la
section `unavailable` (pas de compteurs inventés).

## 18.3. ntfy

Statut : COMPLETE (Phase 18.3).

Adapter `ntfy` composé dans `apps/web`. Transport HTTP(S) vers l'origine ntfy.
Auth Bearer optionnelle (`Authorization: Bearer <accessToken>` uniquement si un
jeton est configuré). Lecture seule `GET /v1/health`, `GET /v1/stats`,
`GET /v1/version`. Voir ADR 0022. Publication, subscribe/poll/websocket/SSE,
`/v1/config`, `/metrics` et `/v1/account` sont hors scope.

`ntfy.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
ntfy (`integration.use|manage` + `ntfy.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `ntfy` sans
`integration.manage`.

Widget `ntfy-status` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Jeton jamais renvoyé. Aucune mutation. Aucune
fake data. Noms de topics et corps de messages jamais exposés. Un 401/403/404
sur `/v1/version` rend la section `unavailable` (pas de version inventée).

## 18.4. Sonarr

Statut : COMPLETE (Phase 18.4).

Adapter `sonarr` composé dans `apps/web`. Transport HTTP(S) vers l'origine Sonarr.
Auth header obligatoire (`X-Api-Key` uniquement). Lecture seule
`GET /api/v3/system/status`, `GET /api/v3/health`, `GET /api/v3/queue/status`,
`GET /api/v3/series`, `GET /api/v3/diskspace`. Voir ADR 0023. POST/PUT/DELETE,
`/api/v3/command`, queue grab/remove et `apikey` en query sont hors scope.

`sonarr.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Sonarr (`integration.use|manage` + `sonarr.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `sonarr` sans
`integration.manage`.

Widget `sonarr-overview` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Clé API jamais renvoyée. Aucune mutation. Aucune
fake data. Titres, chemins et messages de santé jamais exposés. Un 403/404 sur
`/api/v3/diskspace` rend la section `unavailable` (pas de zéros inventés).

## 18.5. Radarr

Statut : COMPLETE (Phase 18.5).

Adapter `radarr` composé dans `apps/web`. Transport HTTP(S) vers l'origine Radarr.
Auth header obligatoire (`X-Api-Key` uniquement). Lecture seule
`GET /api/v3/system/status`, `GET /api/v3/health`, `GET /api/v3/queue/status`,
`GET /api/v3/movie`, `GET /api/v3/diskspace`. Voir ADR 0024. POST/PUT/DELETE,
`/api/v3/command`, queue grab/remove et `apikey` en query sont hors scope.

`radarr.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Radarr (`integration.use|manage` + `radarr.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `radarr` sans
`integration.manage`.

Widget `radarr-overview` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Clé API jamais renvoyée. Aucune mutation. Aucune
fake data. Titres, chemins et messages de santé jamais exposés. Un 403/404 sur
`/api/v3/diskspace` rend la section `unavailable` (pas de zéros inventés).

## 18.6. Prowlarr

Statut : COMPLETE (Phase 18.6).

Adapter `prowlarr` composé dans `apps/web`. Transport HTTP(S) vers l'origine Prowlarr.
Auth header obligatoire (`X-Api-Key` uniquement). Lecture seule
`GET /api/v1/system/status`, `GET /api/v1/health`, `GET /api/v1/indexer`,
`GET /api/v1/indexerstatus`. Voir ADR 0025. POST/PUT/DELETE, `/api/v1/search`,
`/api/v1/command` et `apikey` en query sont hors scope.

`prowlarr.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Prowlarr (`integration.use|manage` + `prowlarr.read`). `integration.read` n'est
pas requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `prowlarr` sans
`integration.manage`.

Widget `prowlarr-status` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Clé API jamais renvoyée. Aucune mutation. Aucune
fake data. Noms d'indexeurs, URLs, `apiKey`, mot de passe, catégories et
messages de santé jamais exposés. Un 403/404 sur `/api/v1/indexerstatus` rend
la section `unavailable` (pas de zéros inventés).

## 18.7. qBittorrent

Statut : COMPLETE (Phase 18.7).

Adapter `qbittorrent` composé dans `apps/web`. Transport HTTP(S) vers l'origine
qBittorrent. Auth cookie de session (`POST /api/v2/auth/login`, cookie `SID`
éphémère). Lecture seule `GET /api/v2/app/version`, `GET /api/v2/transfer/info`,
`GET /api/v2/torrents/info`. Voir ADR 0026. GET login, `apikey`/`password`/`sid`
en query et mutations torrent sont hors scope.

`qbittorrent.integration.get` expose uniquement `{ id, name, enabled }` aux
lecteurs qBittorrent (`integration.use|manage` + `qbittorrent.read`).
`integration.read` n'est pas requis. `integration.list` / `integration.get`
omettent `baseUrl`, `config`, `capabilities` et l'état des secrets d'un record
`qbittorrent` sans `integration.manage`.

Widget `qbittorrent-transfer` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Cookie `SID` et mot de passe jamais renvoyés.
Aucune mutation. Aucune fake data. Noms, hashs, magnets, chemins et trackers
jamais exposés.

## 18.8. Seerr

Statut : COMPLETE (Phase 18.8).

Adapter `seerr` composé dans `apps/web`. Transport HTTP(S) vers l'origine Seerr
(compatible Jellyseerr / Overseerr, même API v1 officielle). Auth header
obligatoire (`X-Api-Key` uniquement). Lecture seule `GET /api/v1/status`,
`GET /api/v1/request/count`. Voir ADR 0027. POST/PUT/DELETE, approve/decline et
`apikey` en query sont hors scope. Un seul type d'intégration : `seerr`.

`seerr.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs
Seerr (`integration.use|manage` + `seerr.read`). `integration.read` n'est pas
requis. `integration.list` / `integration.get` omettent `baseUrl`, `config`,
`capabilities` et l'état des secrets d'un record `seerr` sans
`integration.manage`.

Widget `seerr-requests` : `publicSafe=false`. Refresh manuel 10/min. Cache
overview 8 s (5 s si partiel). Clé API jamais renvoyée. Aucune mutation. Aucune
fake data. Titres, utilisateurs, e-mails et identifiants TMDB jamais exposés.
Un 403/404 sur `/api/v1/request/count` rend la section `unavailable` (pas de
zéros inventés). Un 401/403 sur `/api/v1/status` échoue l'overview.

## 18.9. Custom API

Statut : COMPLETE (Phase 18.9).

Adapter `custom-api` composé dans `apps/web`. Transport HTTP(S) vers une origine
déclarée. GET uniquement vers une allowlist d'endpoints `{ key, label, path }`
(max 8). Voir ADR 0028. POST/PUT/DELETE, URL widget, proxy générique, query
string et JSONPath générique sont hors scope.

`customApi.integration.get` expose `{ id, name, enabled, endpoints }` aux
lecteurs Custom API (`integration.use|manage` + `custom-api.read`).
`integration.read` n'est pas requis. `integration.list` / `integration.get`
omettent `baseUrl`, `config`, `capabilities` et l'état des secrets d'un record
`custom-api` sans `integration.manage`.

Widget `custom-api-value` : `publicSafe=false`. Refresh manuel 10/min. Cache
8 s (5 s si partiel, 15 s en échec). Secrets jamais renvoyés. Aucune mutation.
Aucune fake data. JSON brut jamais exposé. Pas une source `service-status`.

## 19. Service status

Agrégateur interne read-only, pas une nouvelle intégration externe.

`serviceStatus.list` / `serviceStatus.catalog` assemblent un DTO canonique
(`up` / `degraded` / `down` / `unknown` / `paused` / `maintenance`) à partir des
sources déjà disponibles : apps health, Docker, Synology, Jellyfin, Immich,
Beszel, Uptime Kuma, Prometheus, Proxmox, Grafana, ntfy, Sonarr, Radarr, Prowlarr, qBittorrent, Seerr. Le filtrage est serveur-side via les permissions
spécialisées (`app.read`, `docker.read`, `synology.read`, `jellyfin.read`,
`immich.read`, `beszel.read`, `uptime-kuma.read`, `prometheus.read`, `proxmox.read`,
`grafana.read`, `ntfy.read`, `sonarr.read`, `radarr.read`, `prowlarr.read`,
`qbittorrent.read`, `seerr.read`). Un DTO
générique `integration.list` n'est jamais utilisé pour construire ce widget.

Widget `service-status` : `publicSafe=false`. Config bornée (`selectedSources`,
`selectedIds`, `displayMode`, `maxItems` ≤ 24). Une source en échec laisse les
autres visibles (`degraded` / `partial`). Aucun secret, `baseUrl`, config, token
ou réponse brute. Cache/coalescing côté serveur. Pas d'appel navigateur.

## 20. Tests intégrations

Pour chaque adapter :

- auth success ;
- auth failure ;
- timeout ;
- invalid JSON ;
- partial response ;
- version unsupported ;
- permission.
