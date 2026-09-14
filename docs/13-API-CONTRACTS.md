# 13 — Contrats API

## 1. Style

tRPC interne.

Les noms doivent suivre un domaine clair :

```text
board.list
board.get
board.create
board.update
board.delete
board.layout.updateBatch

app.list
app.create
app.update
app.delete
app.get
app.test

integration.list
integration.create
integration.update
integration.setSecret
integration.test
integration.delete

docker.permissions
docker.integration.get
docker.system.get
docker.containers.list
docker.containers.get
docker.containers.stats
docker.containers.logs
docker.containers.start
docker.containers.stop
docker.containers.restart

synology.permissions
synology.integration.get
synology.overview.get
synology.overview.refresh
synology.auth.enrollDevice
synology.auth.clearDevice

jellyfin.permissions
jellyfin.integration.list
jellyfin.integration.get
jellyfin.overview.get
jellyfin.overview.refresh

widget.catalog
widget.data

admin.users.*
admin.groups.*
admin.settings.*
```

## 2. Erreurs métier

Format logique :

```ts
type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTEGRATION_UNREACHABLE"
  | "INTEGRATION_TIMEOUT"
  | "INTEGRATION_UNAUTHORIZED"
  | "INTERNAL_ERROR";
```

Le client reçoit un message safe.

Les détails sensibles restent logs serveur.

`app.list/get` exigent `app.read`; `app.create/update/delete/test` exigent `app.manage`. `app.test`
retourne uniquement status, latence, status HTTP et code sûr. Le résultat est conditionné à la
révision de configuration afin d'éviter une écriture stale.

`app.list` utilise un curseur UUID stable et une limite comprise entre 1 et 100. La réponse contient
`items` et `nextCursor`; l'interface expose la page suivante au lieu de masquer les Apps au-delà d'un
plafond global.

## 3. Board create

Input :

```json
{
  "name": "Infrastructure",
  "slug": "infrastructure"
}
```

Output :

```json
{
  "id": "...",
  "slug": "infrastructure",
  "revision": 1
}
```

## 4. Layout update batch

Input conceptuel :

```json
{
  "boardId": "...",
  "layoutId": "...",
  "expectedRevision": 12,
  "items": [{ "itemId": "...", "x": 0, "y": 0, "w": 3, "h": 2 }]
}
```

Validation :

- coordonnées entières ;
- bornes ;
- appartenance item/board ;
- permission ;
- collision selon moteur.

## 5. Integration setSecret

Ne jamais utiliser `integration.update` pour retourner/modifier secrets comme config ordinaire.

Input :

```json
{
  "integrationId": "...",
  "key": "apiKey",
  "value": "..."
}
```

Output :

```json
{
  "configured": true
}
```

Une lecture renvoie :

```json
{
  "apiKey": {
    "configured": true
  }
}
```

Jamais la valeur.

## 6. Integration test

Output :

```json
{
  "ok": true,
  "latencyMs": 81,
  "metadata": {
    "version": "..."
  }
}
```

ou :

```json
{
  "ok": false,
  "code": "TIMEOUT"
}
```

## 7. Widget data

Ne pas créer une endpoint générique permettant d'invoquer n'importe quelle méthode d'intégration côté client.

Le widget appelle une procédure métier contrôlée.

## 8. Pagination

Toutes les grandes listes utilisent curseur ou page stable.

Logs Docker : curseur/timestamp + limite.

Audit : pagination obligatoire.

## 9. Timeouts

Chaque route externe a un timeout.

Le timeout client ne doit pas être plus court sans raison que le timeout serveur.

## 10. Idempotence

Actions de configuration critiques peuvent accepter un idempotency key future.

Board layout batch doit être sûr à rejouer si revision identique/non modifiée.

# Board API — Phase 4

Le routeur tRPC interne expose `board.list`, `board.get`, `board.create`, `board.update`, `board.delete` et `board.layout.updateBatch`. Le contexte résout la session, le sujet RBAC et le service Board côté serveur. Tous les inputs sont validés par Zod.

`board.layout.updateBatch` reçoit `boardId`, `layoutId`, `expectedRevision` et une liste bornée de placements. Une révision obsolète produit `BOARD_REVISION_CONFLICT`, mappé en `CONFLICT`, afin que le client recharge. Les erreurs SQL et stack traces ne font pas partie du DTO.

# Widget API — Phase 6

`widget.catalog` retourne les métadonnées stables du registry built-in (`id`, `version`, `name`, `description`, `category`, tailles, `publicSafe`). Aucun composant React, schéma Zod interne ou fonction de migration n'est exposé.

`board.item.create`, `board.item.update` et `board.item.delete` exigent `board.edit` et `expectedRevision`. Le client ne peut pas changer `widgetType`, `widgetVersion`, `boardId` ni `integrationId` via update. La config est validée par le registry. Un item d'un autre board est rejeté.

`widget.data` générique n'est pas implémenté. Clock et Bookmarks n'ont aucune query réseau. App Tile réutilise `app.get` / `app.list`.

# App Library API — Phase 7.5 / 7.6

`app.library.list` et `app.library.get` exigent `app.read`. Ils retournent des metadata sérialisables
(`id`, `name`, `description`, `category`, `icon.path`, `tags`, `website`, `documentation`, defaults
sûrs, `lifecycle`). `lifecycle.status` est toujours présent côté vue (`active` par défaut).
`replacedBy` et `replacedByName` sont exposés lorsqu'une succession officielle existe.
Aucune fonction matcher, aucun objet interne du registry et aucune URL utilisateur inventée
ne sont exposés. La création d'App continue d'exiger `app.manage` via `app.create`.
Le lifecycle n'est pas une colonne DB.

# Integration API — Phase 7

Le routeur expose `integration.list`, `integration.get`, `integration.catalog`, `integration.create`,
`integration.update`, `integration.setSecret`, `integration.test` et `integration.delete`.
`integration.catalog` retourne les metadata safe du registry (id, displayName, version, description,
capabilities, config/secret field labels). Aucun schéma Zod interne ni secret n'est exposé.

`integration.test` exige `integration.manage` et retourne un `ConnectionResult` sans secret. Un
catalogue générique vide reste valide. La composition application Phase 8 enregistre Docker.
`integration.call` / `integration.invoke` / `docker.request` n'existent pas.

Pour un record `type=synology`, `integration.list` et `integration.get` n'exposent `baseUrl`,
`config`, `capabilities` ni l'état des secrets qu'aux acteurs avec `integration.manage`.

# Docker API — Phase 8

Routeur tRPC `docker` (aucun generic invoke, aucun `method`/`path` client).

Inputs communs : `integrationId` UUID ; `containerId` exactement 64 hex lowercase.
`limit` 1–200 (défaut 100). `tail` 1–500 (défaut 200). `sinceSeconds` 0–86400.
`timeoutSeconds` 0–30 (défaut 10).

| Route                       | Permission                              | Capability           | Notes                                                                                            |
| --------------------------- | --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `docker.permissions`        | auth active                             | —                    | Helper UI only : `canRead`, `canLogs`, `canStart`, `canStop`, `canRestart`, `canManage`          |
| `docker.integration.list`   | use/manage + docker.read/manage         | —                    | `{ id, name, enabled }[]` ; pas de `integration.read`                                            |
| `docker.integration.get`    | use/manage + docker.read/manage         | —                    | `{ id, name, enabled }` uniquement ; pas de réseau Docker ; pas de `config`/`trustedCaPem`       |
| `docker.system.get`         | use/manage + docker.read/manage         | `containers.read`    | `engineVersion`, `serverApiVersion`, `serverMinApiVersion`, `negotiatedApiVersion` ; pas `/info` |
| `docker.containers.list`    | idem                                    | `containers.read`    | DTO summary sûr ; plafond transport liste 2 MiB (inspect/stats restent 256 KiB)                  |
| `docker.containers.get`     | idem                                    | `containers.read`    | DTO inspect sûr                                                                                  |
| `docker.containers.stats`   | idem                                    | `containers.stats`   | one-shot, cache ~2 s                                                                             |
| `docker.containers.logs`    | use/manage + docker.logs/manage         | `containers.logs`    | mutation explicite, jamais cachée, 512 KiB                                                       |
| `docker.containers.start`   | interact/manage + docker.start/manage   | `containers.start`   | POST, 0 retry                                                                                    |
| `docker.containers.stop`    | interact/manage + docker.stop/manage    | `containers.stop`    | confirmation UI                                                                                  |
| `docker.containers.restart` | interact/manage + docker.restart/manage | `containers.restart` | AC-011 : FORBIDDEN sans `docker.restart`                                                         |

DTO list/detail : `id`, `shortId`, `names`/`name`, `image`, `state`, `statusText`/`health`,
`ports` bornés, `recognizedApp` (`id`, `name`, `iconPath`, `lifecycleStatus`, `replacedBy`,
`replacedByName`). Detail ajoute `startedAt`, `finishedAt`, `restartCount`, `uptimeSeconds`.

Jamais exposés : `Env`, `Labels`, `Command`, `Args`, `Mounts`, `HostConfig`, NetworkSettings brut,
GraphDriver, secrets.

Stats : `cpuPercent`, `memoryUsageBytes`, `memoryLimitBytes`, `memoryPercent`, `networkRxBytes`,
`networkTxBytes`, `blockReadBytes`, `blockWriteBytes` — `null` si inconnu, jamais `0` pour « inconnu ».

Erreurs : `UNAUTHORIZED`, `FORBIDDEN` (RBAC ou 403 proxy), `NOT_FOUND`, `CONFLICT` (409),
`TOO_MANY_REQUESTS`, `TIMEOUT`, `BAD_REQUEST` (validation / DNS / TLS / réponse invalide).
ID invalide : `BAD_REQUEST` sans requête Docker.

# Synology API — Phase 9

Routeur tRPC `synology` (aucun generic invoke, aucun `method`/`path` client).
Input : `integrationId` UUID.

| Route                        | Permission                 | Capability                                        | Notes                                                                                   |
| ---------------------------- | -------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `synology.permissions`       | auth active                | —                                                 | Helper UI : `canRead`, `canManageAuth`                                                  |
| `synology.integration.list`  | use/manage + synology.read | —                                                 | `{ id, name, enabled }[]` ; pas de `integration.read`                                   |
| `synology.integration.get`   | use/manage + synology.read | —                                                 | `{ id, name, enabled }` ; pas de réseau DSM ; pas de `config`/`trustedCaPem`/secrets    |
| `synology.overview.get`      | use/manage + synology.read | `system.read` + `resources.read` + `storage.read` | Vue unique ; cache 15 s (5 s si partiel) ; cache-miss single-flight ; SID jamais caché  |
| `synology.overview.refresh`  | use/manage + synology.read | idem                                              | Invalide le cache ; 10 requêtes / min / acteur / intégration                            |
| `synology.auth.enrollDevice` | integration.manage         | —                                                 | OTP 4–8 digits transitoire ; persiste `deviceId` server-managed ; ne renvoie pas le DID |
| `synology.auth.clearDevice`  | integration.manage         | —                                                 | Efface uniquement le jeton local                                                        |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, sections `system` /
`resources` / `storage` chacune `{ status, data, reason? }`.
System : `model`, `dsmVersion`, `uptimeSeconds`, `systemTemperatureC`, `ramTotalBytes`,
`cpuCores`, `cpuFamily`, `cpuSeries` (null si absent).
Resources : CPU `user+system+other` (somme dans `[0, 100]`), RAM en octets (`avail <= total`,
total `> 0`) ; sinon section `invalid-response`.
Volumes / disks : capacité, utilisé, état, température, SMART si présent.

# Jellyfin API — Phase 10

Routeur tRPC `jellyfin` (aucun generic invoke). Input : `integrationId` UUID.

| Route                       | Permission                 | Capability                                       | Notes                                                |
| --------------------------- | -------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| `jellyfin.permissions`      | auth active                | —                                                | `canRead`, `canManage`                               |
| `jellyfin.integration.list` | use/manage + jellyfin.read | —                                                | `{ id, name, enabled }[]`                            |
| `jellyfin.integration.get`  | use/manage + jellyfin.read | —                                                | `{ id, name, enabled }`                              |
| `jellyfin.overview.get`     | use/manage + jellyfin.read | `server.read` + `sessions.read` + `streams.read` | Cache 8 s (5 s si partiel) ; coalescer ; clé SHA-256 |
| `jellyfin.overview.refresh` | use/manage + jellyfin.read | idem                                             | 10 requêtes / min / acteur / intégration             |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, sections `server` /
`sessions`. Auth : header `X-Emby-Token` uniquement.

# Immich API — Phase 11

Routeur tRPC `immich` (aucun generic invoke). Input : `integrationId` UUID.

| Route                     | Permission               | Capability                                    | Notes                                                 |
| ------------------------- | ------------------------ | --------------------------------------------- | ----------------------------------------------------- |
| `immich.permissions`      | auth active              | —                                             | `canRead`, `canManage`                                |
| `immich.integration.list` | use/manage + immich.read | —                                             | `{ id, name, enabled }[]`                             |
| `immich.integration.get`  | use/manage + immich.read | —                                             | `{ id, name, enabled }`                               |
| `immich.overview.get`     | use/manage + immich.read | `server.read` + `stats.read` + `storage.read` | Cache 15 s (8 s si partiel) ; coalescer ; clé SHA-256 |
| `immich.overview.refresh` | use/manage + immich.read | idem                                          | 10 requêtes / min / acteur / intégration              |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, sections `server`,
`health`, `storage`, `stats`. Auth : header `x-api-key` uniquement.

Jamais exposés : clé API, EXIF, chemins filesystem, thumbnails, `usageByUser`, URLs
about, `baseUrl`, config.

# Beszel API — Phase 12

Routeur tRPC `beszel` (aucun generic invoke). Input : `integrationId` UUID.

| Route                     | Permission               | Capability   | Notes                                                 |
| ------------------------- | ------------------------ | ------------ | ----------------------------------------------------- |
| `beszel.permissions`      | auth active              | —            | `canRead`, `canManage`                                |
| `beszel.integration.list` | use/manage + beszel.read | —            | `{ id, name, enabled }[]`                             |
| `beszel.integration.get`  | use/manage + beszel.read | —            | `{ id, name, enabled }`                               |
| `beszel.overview.get`     | use/manage + beszel.read | `hosts.read` | Cache 15 s (8 s si partiel) ; coalescer ; clé SHA-256 |
| `beszel.overview.refresh` | use/manage + beszel.read | `hosts.read` | 10 requêtes / min / acteur / intégration              |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, section `hosts`.
Auth : header `Authorization` (token éphémère). Jamais persisté.

Jamais exposés : mot de passe, token PocketBase, metadata PocketBase brute,
`collectionId`, `baseUrl`, config.

# Uptime Kuma API — Phase 12

Routeur tRPC `uptimeKuma` (aucun generic invoke). Input : `integrationId` UUID.

| Route                         | Permission                    | Capability      | Notes                                                 |
| ----------------------------- | ----------------------------- | --------------- | ----------------------------------------------------- |
| `uptimeKuma.permissions`      | auth active                   | —               | `canRead`, `canManage`                                |
| `uptimeKuma.integration.list` | use/manage + uptime-kuma.read | —               | `{ id, name, enabled }[]`                             |
| `uptimeKuma.integration.get`  | use/manage + uptime-kuma.read | —               | `{ id, name, enabled }`                               |
| `uptimeKuma.overview.get`     | use/manage + uptime-kuma.read | `monitors.read` | Cache 15 s (8 s si partiel) ; coalescer ; clé SHA-256 |
| `uptimeKuma.overview.refresh` | use/manage + uptime-kuma.read | `monitors.read` | 10 requêtes / min / acteur / intégration              |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, section `monitors`.
Auth : header `Authorization: Basic` (username vide, mot de passe = clé API). Jamais
dans l'URL.

Jamais exposés : clé API, `monitor_url`, `monitor_hostname`, `monitor_port`, labels
bruts, incidents (non disponibles sur `/metrics`), `baseUrl`, config.

# Prometheus API — Phase 12

Routeur tRPC `prometheus` (aucun generic invoke, aucun GET PromQL).

| Route                         | Permission                   | Capability   | Notes                                                               |
| ----------------------------- | ---------------------------- | ------------ | ------------------------------------------------------------------- |
| `prometheus.permissions`      | auth active                  | —            | `canRead`, `canManage`                                              |
| `prometheus.integration.list` | use/manage + prometheus.read | —            | `{ id, name, enabled }[]`                                           |
| `prometheus.integration.get`  | use/manage + prometheus.read | —            | `{ id, name, enabled }`                                             |
| `prometheus.overview.get`     | use/manage + prometheus.read | `query.read` | Requête serveur fixe `up` ; cache 15 s (8 s si partiel) ; coalescer |
| `prometheus.overview.refresh` | use/manage + prometheus.read | `query.read` | 10 requêtes / min / acteur / intégration                            |
| `prometheus.query.instant`    | use/manage + prometheus.read | `query.read` | Input Zod `query` 1–512 ; POST form-urlencoded                      |
| `prometheus.query.range`      | use/manage + prometheus.read | `query.read` | `start`/`end` dérivés serveur ; range 60–21600 ; step 15–3600       |

DTO : `resultType` (`vector` \| `matrix`), `series` (labels allowlist + points
`{ tMs, value }`), `truncated`, `seriesCount`, `sampleCount`, `fetchedAt`,
`status` (`available` \| `degraded`).

Auth : header `Authorization: Bearer` optionnel. Jamais dans l'URL.

Jamais exposés : jeton Bearer, PromQL dans l'URL, JSON Prometheus brut, labels hors
`__name__` / `job` / `instance`, `baseUrl`, config.

# Proxmox API — Phase 18

Routeur tRPC `proxmox` (aucun generic invoke). Input : `integrationId` UUID.

| Route                      | Permission                | Capability     | Notes                                                |
| -------------------------- | ------------------------- | -------------- | ---------------------------------------------------- |
| `proxmox.permissions`      | auth active               | —              | `canRead`, `canManage`                               |
| `proxmox.integration.list` | use/manage + proxmox.read | —              | `{ id, name, enabled }[]`                            |
| `proxmox.integration.get`  | use/manage + proxmox.read | —              | `{ id, name, enabled }`                              |
| `proxmox.overview.get`     | use/manage + proxmox.read | `cluster.read` | Cache 8 s (5 s si partiel) ; coalescer ; clé SHA-256 |
| `proxmox.overview.refresh` | use/manage + proxmox.read | `cluster.read` | 10 requêtes / min / acteur / intégration             |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, sections `version`,
`cluster`, `nodes`, `guests`, `storage`. Auth : header `Authorization: PVEAPIToken=`.
Jamais dans l'URL.

Jamais exposés : jeton API, cookie `PVEAuthCookie`, noms de VM/CT, chemins storage,
IP de nœuds, `baseUrl`, config.

# Service Status API — Phase 12

Agrégateur interne. Aucun generic invoke. Aucun appel navigateur vers les services.

| Route                   | Permission                           | Notes                                                                                  |
| ----------------------- | ------------------------------------ | -------------------------------------------------------------------------------------- |
| `serviceStatus.list`    | auth active + per-source specialized | DTO `{ status, items, truncated, partial, fetchedAt }` ; sources non autorisées omises |
| `serviceStatus.catalog` | auth active + per-source specialized | `{ id, name, sourceType }[]` identités seulement ; pas d'overview                      |

DTO item : `id`, `name`, `sourceType`, `integrationId` nullable, `status`
(`up` \| `degraded` \| `down` \| `unknown` \| `paused` \| `maintenance`),
`detail` nullable, `updatedAt` nullable.

Input : `selectedSources` (≤ nombre de sources connues), `selectedIds` (≤ 24, pattern `source:uuid[:container]`),
`maxItems` 1–24 (défaut 12). IDs dupliqués dédupliqués. IDs invalides refusés.

Jamais exposés : `baseUrl`, config, secrets, apiKey, password, SID, token, headers,
réponse brute, `integration.list` générique.

Un utilisateur `jellyfin.read` sans `synology.read` ne voit jamais Synology, même si
les deux IDs sont dans `selectedIds`.

Jamais exposés : mot de passe, SID, synotoken, DID, OTP, numéros de série, `baseUrl`, config.

`status` section : `available` \| `degraded` \| `unavailable`. Une section Utilization/Storage
en échec n'invente pas 0 % et n'échoue pas toute la page. Un payload DSM.Info, Storage ou
Utilization structurellement invalide est `invalid-response`. Un élément volume/disque
malformé (null, scalaire, tableau, objet sans identité DSM reconnue) rend aussi Storage
`invalid-response` ; `volumes: []` et `disks: []` restent valides. Core.System annoncé mais en
échec : section système `degraded` avec DSM.Info conservé. Cache overview lié à une génération
de connexion et à une génération de refresh manuel runtime, pas seulement à `synology.overview`.

# Runtime / realtime — Phase 13

Fondations. Redis n'est pas source de vérité. Aucun appel navigateur vers Redis.

| Route             | Permission      | Notes                                                                                                                       |
| ----------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `runtime.status`  | `settings.read` | `{ redis, worker, realtime }` chacun `disabled` \| `up` \| `down`                                                           |
| `realtime.ticket` | session active  | Ticket HMAC 60 s. Input optionnel `{ boardIds, integrationIds, runtime }`. Les scopes sont filtrés serveur avant signature. |

La santé Redis de `runtime.status` est un `PING` protocole (AUTH / TLS / `rediss:`), jamais un
simple connect TCP. Jamais exposés : `REDIS_URL`, mot de passe Redis, `AUTH_SECRET`, payload brut Redis.

`GET /events?ticket=` et `GET /ws?ticket=` n'émettent un `DomainEvent` que si le ticket
vérifié contient le scope correspondant (`board:<id>`, `integration:<id>`, `runtime`).
Default deny. Redis n'est jamais source de vérité RBAC. Payloads minimaux : pas de layout,
ACL, config, secrets, URLs privées. WebSocket n'accepte pas de commandes client (hors
ping/pong). Reverse proxy : `Connection: Upgrade` et `Upgrade: websocket`. Le navigateur
tente `/api/realtime/ws` (rewrite same-origin) puis retombe sur SSE.

`integration.data.changed` est un signal d'invalidation (id + type + occurredAt). Le client
autorisé refetch le DTO existant, avec debounce. Le polling 10 s reste le producteur autonome
des vues board (aucun second client d'intégration dans le worker). SSE accélère le refetch
après un refresh manuel ou une mutation. Le proxy same-origin `GET /api/realtime/events`
relais SSE sans exposer `REALTIME_URL` au navigateur.

Un board `public` n'autorise pas le stream realtime. `runtime` exige `settings.read`.
Les intégrations spécialisées réutilisent docker/synology/jellyfin/immich/beszel/prometheus/
uptime-kuma/proxmox `*.read` + `integration.use` ; `integration.read` ne donne pas accès aux types
spécialisés.

| Route       | Permission      | Notes                                                                                             |
| ----------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `jobs.list` | `settings.read` | `{ items }` borné (≤ 50). DTO : id, type, status, dates ISO, attempt, errorCode, errorMessageSafe |

Jamais exposés : `metadataJson`, secrets, stack traces, `REDIS_URL`.

# Backup — Phase 14

Archive JSON non fiable. Permission `backup.manage` uniquement (SYSTEM_ADMIN par
défaut). Les secrets d'intégration restent en ciphertext. Pas de mutation pendant
`validate`. `restore` exige `confirm: true` et prend un backup pré-restore avant
la transaction.

| Route             | Permission      | Notes                                                                                                            |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `backup.export`   | `backup.manage` | Mutation (plus de query GET). Archive `{ manifest, tables }`. `formatVersion` 1, `schemaVersion` 6. Rate limité. |
| `backup.validate` | `backup.manage` | Preview (comptages, versions). Rejette table/colonne/clé inconnue avant toute mutation.                          |
| `backup.restore`  | `backup.manage` | Input `{ archive, confirm: true }`. Backup pré-restore, restore transactionnel, puis cache.                      |

Jamais exposés en preview : ciphertext, iv, authTag, `passwordHash`. Jamais de secret
en clair dans l'archive. Schéma ≠ 5 et ≠ 6 → `INCOMPATIBLE_SCHEMA`. `audit_logs` et
`auth_sessions` sont exclus de l'archive.

# SSO / admin avancé — Phase 15

OIDC générique, audit et sessions. Les secrets OIDC et d'intégration restent
côté serveur.

| Route                      | Permission            | Notes                                                                  |
| -------------------------- | --------------------- | ---------------------------------------------------------------------- |
| `oidc.publicConfig`        | public                | `{ enabled, displayName, allowLocalLogin }` sans secret.               |
| `oidc.getSettings`         | `oidc.manage`         | Config + `hasClientSecret`. Jamais le plaintext.                       |
| `oidc.saveSettings`        | `oidc.manage`         | Secret optionnel, chiffré. Redirect borné à `/api/auth/callback/oidc`. |
| `oidc.listMappings`        | `oidc.manage`         | Mapping groupes OIDC → groupes locaux.                                 |
| `oidc.replaceMappings`     | `oidc.manage`         | Remplacement atomique, default-deny.                                   |
| `audit.list`               | `audit.read`          | Pagination `limit` ≤ 100, curseur, filtres action/acteur/dates.        |
| `session.listSelf`         | `session.read.self`   | Sessions actives de l'appelant. `current` sans secret.                 |
| `session.revokeSelf`       | `session.revoke.self` | Révoque une session de l'appelant.                                     |
| `session.revokeOthers`     | `session.revoke.self` | Révoque toutes sauf la session courante.                               |
| `session.listForUser`      | `session.manage`      | Sessions d'un autre utilisateur.                                       |
| `session.revokeForUser`    | `session.manage`      | Révocation admin.                                                      |
| `session.revokeAllForUser` | `session.manage`      | Révocation admin de toutes les sessions.                               |
