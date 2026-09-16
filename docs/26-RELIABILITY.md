# 26 — Reliability & SLO Analytics

Phase 26. Migrations `0011`–`0012`. DB `schemaVersion` **12**.
Backup `formatVersion` 1 / `schemaVersion` **11** (SLO config durable ;
rollups exclus).

## Objectif

Agrégats d’availability **quotidiens UTC** dérivés des incidents et des
fenêtres de maintenance — pas de nouveau backend de monitoring, pas de
PromQL arbitraire, pas de stockage haute fréquence.

## Table `service_reliability_daily` (0011)

| Colonne           | Rôle                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------ |
| `serviceKey`      | Clé opaque stable (= `integrations.id`)                                                    |
| `dateUtc`         | Jour UTC `YYYY-MM-DD`                                                                      |
| buckets           | `available` / `degraded` / `unavailable` / `maintenance` / `unknown` (secondes, exclusifs) |
| `observedSeconds` | Secondes observées du jour (≤ 86400 ; jour courant tronqué à `now`)                        |
| `incidentCount`   | Incidents availability touchant le jour                                                    |

Unique `(serviceKey, dateUtc)`.

## Précédence des buckets

Pour chaque seconde (sweep) :

1. `maintenance`
2. `unavailable` (incident availability ouvert)
3. `degraded` (réservé ; 0 tant qu’aucun signal)
4. `available` (baseline si le service est observable)
5. `unknown` (avant `integrations.createdAt`)

Somme des buckets ≤ `observedSeconds`. Pas de double comptage.

## Rebuild

- Source : `incidents` + `maintenance_windows` (+ targets)
- Fenêtre défaut **7** jours, max **90**
- Upsert idempotent (overwrite du jour)
- Worker `reliability.tick()` : rebuild 2 jours + rétention

## Rétention

730 jours (2 ans). Au-delà : delete.

## SLO / error budget (0012 — PR 26.2)

Table `service_slos` :

| Colonne                | Rôle                                  |
| ---------------------- | ------------------------------------- |
| `serviceKey`           | Clé opaque (= integration id)         |
| `objectiveBasisPoints` | 90_000–99_999 (90.000%–99.999%)       |
| `windowDays`           | 7 / 30 / 90                           |
| `excludeMaintenance`   | retire la maintenance du dénominateur |
| `configRevision`       | optimistic concurrency                |

### Formule disponibilité

- `unknown` exclu du numérateur et du dénominateur (conservateur).
- `degraded` compte contre la disponibilité (non “good”).
- Si `excludeMaintenance` : maintenance retirée du dénominateur.
- Sinon : maintenance reste dans le dénominateur, jamais “available”.
- Objectif 100% rejeté (error budget pathologique).

### Error budget

Entiers :

- `allowedDowntime = floor(eligible * (100000 - objective) / 100000)`
- `consumed = max(0, eligible - available)`
- `remainingBudgetBps` dérivé de remaining/allowed

## Backup

- `service_reliability_daily` **exclu** (dérivé rejouable).
- `service_slos` **inclus** → `BACKUP_SCHEMA_VERSION` **11** (compat 5–11).

## Permissions

| Permission         | Rôle                       |
| ------------------ | -------------------------- |
| `reliability.read` | lecture rollups / evaluate |
| `slo.manage`       | CRUD objectifs SLO         |

ADMIN default-deny pour les deux.

## API

| Route                       | Notes                             |
| --------------------------- | --------------------------------- |
| `reliability.permissions`   | `{ canRead, canManageSlo }`       |
| `reliability.listDaily`     | ≤50 serviceKeys, ≤90 jours        |
| `reliability.rebuildRecent` | `settings.manage` ou SYSTEM_ADMIN |
| `reliability.listSlos`      |                                   |
| `reliability.getSlo`        |                                   |
| `reliability.createSlo`     | `slo.manage`                      |
| `reliability.updateSlo`     | revision conflict                 |
| `reliability.deleteSlo`     | revision conflict                 |
| `reliability.evaluateSlo`   | window + error budget             |
| `reliability.summarize`     | ≤50 keys, agrégat fenêtre unique  |

## UI (PR 26.3)

Routes Next.js (RSC + server actions, pas de client tRPC) :

| Route                       | Contenu                                              |
| --------------------------- | ---------------------------------------------------- |
| `/reliability`              | vue d’ensemble (summarize 30 j, max 50 services)     |
| `/reliability/[serviceKey]` | détail, table quotidienne, SVG, CRUD SLO, export CSV |

Navigation : lien « Fiabilité » si `reliability.read`.

Export CSV : échappement Excel (`=`, `+`, `-`, `@` en tête de cellule).

Widget board `reliability-status` (`publicSafe: false`) : intégration,
fenêtre 7/30/90 j, sparkline optionnelle ; résolu via `resolveReliabilityStatusViews`.

## Hors scope 26.3

Burn-rate multi-fenêtre / alerting `slo.budget.low` optionnel ultérieur.
