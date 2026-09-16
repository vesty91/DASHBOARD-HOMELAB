# 25 — Status Pages (safe public projection)

Phase 25. Migration `0010`. `schemaVersion` 10. Backup `formatVersion` 1.

## Objectif

Exposer des pages de statut **sûres** pour un homelab : lecture publique
opt-in uniquement, sans fuite d’identifiants d’intégration, d’URL, d’IP,
de credentials ni d’erreurs brutes.

## Modèle de données (migration `0010`)

Tables créées dès PR 25.1 (y compris maintenance pour éviter une `0011`) :

| Table                        | Rôle                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `status_pages`               | Page (`slug` unique, `visibility` private\|public défaut private, `enabled`, `configRevision`) |
| `status_page_services`       | Services affichés (`sourceIntegrationId` → `integrations`, ordre, historique incidents)        |
| `maintenance_windows`        | Fenêtres (`scheduled`\|`active`\|`completed`\|`cancelled`)                                     |
| `maintenance_window_targets` | Cibles par **`integrationId`** (FK claire, pas de XOR)                                         |

Design cibles maintenance : une fenêtre cible des intégrations. Toute status
page qui liste cette intégration applique le statut `maintenance` en
affichage lorsque la fenêtre est `active`.

## Statuts publics

Enum : `operational` | `degraded` | `outage` | `maintenance` | `unknown`.

Mapping :

- `IntegrationStatus.available` → `operational`
- `IntegrationStatus.unavailable` → `outage`
- `IntegrationStatus.unknown` → `unknown`
- incident de disponibilité **ouvert** → `outage` (vérité interne)
- maintenance **active** sur la cible → `maintenance` (préférence d’affichage ;
  les incidents restent exacts côté interne)
- source inaccessible / absente → `unknown`

Priorité globale de page :
`outage` > `degraded` > `maintenance` > `unknown` > `operational`.

## Slug

- regex stricte `^[a-z0-9]+(?:-[a-z0-9]+)*$`
- longueur 2–64, normalisé en minuscules
- unique
- liste de routes réservées (`api`, `admin`, `login`, …)

## Autorisation

- `status-page.read` / `status-page.manage` (ADMIN default-deny ; `SYSTEM_ADMIN` catalogue)
- lecture publique **uniquement** si `visibility=public` **et** `enabled=true`
- mutations : `expectedConfigRevision` → `CONFLICT` si stale

## API

tRPC `statusPage.*` :

- `permissions`, `list`, `get`, `create`, `update`, `delete`, `replaceServices`
- `getPublic` : sans auth métier, rate-limité (`createInMemoryActionRateLimiter`,
  60 / 60s), cache public TTL **15s** clé = id de page

DTO public : jamais `sourceIntegrationId`, URL, IP, secrets, erreurs brutes.

## Backup

Inclus (config durable) : `status_pages`, `status_page_services`,
`maintenance_windows`, `maintenance_window_targets`.

Exclus (runtime / dérivé) : `notifications`, `incidents`, `incident_events`,
`push_subscriptions`, …

`BACKUP_SCHEMA_VERSION` = **10** ; compat restore **5–10**.

## Hors scope PR 25.1 / 25.2

- UI admin / page publique Next.js (timezone UI deferred — all instants are UTC)
- historique d’incidents public riche

## Maintenance windows (PR 25.2)

Lifecycle : `scheduled` → `active` → `completed`, or `cancelled`.

- Status is **derived from the UTC clock** (`startsAt` / `endsAt`); clients cannot
  force `active`.
- Validation : `endsAt > startsAt`, duration 1 minute–14 days, start within
  5 minutes past … 1 year future.
- Targets : `maintenance_window_targets.integrationId` (no XOR).
- Maintenance **never deletes incidents**; public display may prefer
  `maintenance` when healthy, while open availability incidents still project
  as `outage`.
- Notifications (`createForUser`, category `system`) :
  scheduled / starting / completed, destination `/status-pages/maintenance/:id`.
- Worker tick reconciles stored status with the clock (idempotent CAS + dedupKey).

API (manage / read) :

| Route                            | Permission           |
| -------------------------------- | -------------------- |
| `statusPage.listMaintenance`     | `status-page.read`   |
| `statusPage.getMaintenance`      | `status-page.read`   |
| `statusPage.scheduleMaintenance` | `status-page.manage` |
| `statusPage.cancelMaintenance`   | `status-page.manage` |

Public DTO includes `maintenances[]` (scheduled/active only, no integration IDs).
