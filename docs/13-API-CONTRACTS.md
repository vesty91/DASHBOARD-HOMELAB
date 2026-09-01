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

# Docker API — Phase 8

Routeur tRPC `docker` (aucun generic invoke, aucun `method`/`path` client).

Inputs communs : `integrationId` UUID ; `containerId` exactement 64 hex lowercase.
`limit` 1–200 (défaut 100). `tail` 1–500 (défaut 200). `sinceSeconds` 0–86400.
`timeoutSeconds` 0–30 (défaut 10).

| Route                       | Permission                              | Capability           | Notes                                                                                            |
| --------------------------- | --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------ |
| `docker.permissions`        | auth active                             | —                    | Helper UI only : `canRead`, `canLogs`, `canStart`, `canStop`, `canRestart`, `canManage`          |
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
| `synology.integration.get`   | use/manage + synology.read | —                                                 | `{ id, name, enabled }` ; pas de réseau DSM ; pas de `config`/`trustedCaPem`/secrets    |
| `synology.overview.get`      | use/manage + synology.read | `system.read` + `resources.read` + `storage.read` | Vue unique ; cache 15 s (5 s si partiel) ; SID jamais caché                             |
| `synology.overview.refresh`  | use/manage + synology.read | idem                                              | Invalide le cache ; 10 requêtes / min / acteur / intégration                            |
| `synology.auth.enrollDevice` | integration.manage         | —                                                 | OTP 4–8 digits transitoire ; persiste `deviceId` server-managed ; ne renvoie pas le DID |
| `synology.auth.clearDevice`  | integration.manage         | —                                                 | Efface uniquement le jeton local                                                        |

DTO overview : `status` (`available` \| `degraded`), `fetchedAt`, sections `system` /
`resources` / `storage` chacune `{ status, data, reason? }`.
System : `model`, `dsmVersion`, `uptimeSeconds`, `systemTemperatureC`, `ramTotalBytes`,
`cpuCores`, `cpuFamily`, `cpuSeries` (null si absent).
Resources : CPU `user+system+other`, RAM en octets.
Volumes / disks : capacité, utilisé, état, température, SMART si présent.

Jamais exposés : mot de passe, SID, synotoken, DID, OTP, numéros de série, `baseUrl`, config.

`status` section : `available` \| `degraded` \| `unavailable`. Une section Utilization/Storage
en échec n'invente pas 0 % et n'échoue pas toute la page.
