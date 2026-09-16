# 26 — Reliability & SLO Analytics

Phase 26. Migration `0011`. DB `schemaVersion` 11.
Backup `formatVersion` 1 / `schemaVersion` **10** (inchangé en 26.1 :
pas de config durable nouvelle).

## Objectif

Agrégats d’availability **quotidiens UTC** dérivés des incidents et des
fenêtres de maintenance — pas de nouveau backend de monitoring, pas de
PromQL arbitraire, pas de stockage haute fréquence.

## Table `service_reliability_daily`

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

## Backup

`service_reliability_daily` est **exclu** de l’archive (données dérivées
rejouables). Pas de bump `BACKUP_SCHEMA_VERSION` en 26.1.

## API

Permission `reliability.read` (ADMIN default-deny).

| Route                       | Notes                             |
| --------------------------- | --------------------------------- |
| `reliability.permissions`   | `{ canRead }`                     |
| `reliability.listDaily`     | ≤50 serviceKeys, ≤90 jours        |
| `reliability.rebuildRecent` | `settings.manage` ou SYSTEM_ADMIN |

## Hors scope 26.1

SLO / error budget, UI, widget, CSV (PR 26.2 / 26.3).
