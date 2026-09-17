# 26 — Reliability & SLO Analytics

Phase 26 **COMPLETE**. Phase 27.1 ajoute les rollups horaires (migration `0013`).
Migrations `0011`–`0014`. DB `schemaVersion` **14**.
Backup `formatVersion` 1 / `schemaVersion` **12** (SLO + alert policies ;
rollups et runtime state exclus). Tag `phase-26-complete`. Minor produit `v1.6.0`.

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
- Worker `reliability.tick()` : rebuild 2 jours quotidiens + 48 h horaires + rétention

## Rétention

- Quotidien : 730 jours (2 ans). Au-delà : delete.
- Horaire : 2160 h (90 j). Au-delà : delete.

## Table `service_reliability_hourly` (0013 — Phase 27.1)

| Colonne           | Rôle                                                                     |
| ----------------- | ------------------------------------------------------------------------ |
| `serviceKey`      | Clé opaque stable (= `integrations.id`)                                  |
| `hourUtc`         | Heure UTC `YYYY-MM-DDTHH`                                                |
| buckets           | Même précédence que le quotidien (secondes exclusives)                   |
| `observedSeconds` | Secondes observées de l’heure (≤ 3600 ; heure courante tronquée à `now`) |
| `incidentCount`   | Incidents availability touchant l’heure                                  |

Unique `(serviceKey, hourUtc)`.

Logique d’agrégation partagée via `accountWindowBuckets` (refactor depuis `accountDayBuckets`).

Worker `reliability.tick()` : rebuild **48** dernières heures + purge au-delà de **2160** h.

API `reliability.listHourly` : ≤50 `serviceKeys`, fenêtre max **168** h (7 j).

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

## Burn-rate (Phase 27.2)

Fenêtres **fermées** uniquement (heure UTC courante exclue) : `1h`, `6h`, `24h`, `3d`.

Formule :

- `errorBudgetFraction = (100000 - objectiveBps) / 100000`
- `badFraction = consumed / eligible` (politique unknown / maintenance Phase 26)
- `burnRate = badFraction / errorBudgetFraction`

Paires multi-fenêtre (AND) :

- **fast** : 1h ∧ 6h
- **slow** : 24h ∧ 3d

États fermés : `healthy` | `warning` | `critical` | `insufficient-data`.
Jamais `healthy` sans données éligibles.

API : `reliability.evaluateBurnRate` (`reliability.read`).

Seuils défaut moteur : warning `1`, critical `14.4` (surchargeables ; politiques persistées en 27.3).

## Alert policies (Phase 27.3)

Table `slo_alert_policies` (migration `0014`, DB `schemaVersion` **14**) :

- `enabled` défaut **false**
- seuils warning/critical, cooldown 60–86400 s, `notifyOnRecovery`
- une politique par SLO (`sloId` unique)
- backup **inclus** → backup `schemaVersion` **12**

Table `slo_alert_runtime_state` : dérivée (last state / cooldown) — **exclue** du backup.

Event fermé `slo.burn-rate.changed` (payload safe) → Notification Center (+ automation event allowlist).
Pas de remédiation auto risquée. Dedup : même SLO + même état + cooldown.

## Backup

- `service_reliability_daily` et `service_reliability_hourly` **exclus** (dérivés rejouables).
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
| `reliability.listHourly`    | ≤50 serviceKeys, ≤168 h           |
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
