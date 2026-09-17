# 27 — SLO Burn-Rate Alerting

Phase 27 **COMPLETE**. Tag `phase-27-complete`. Minor produit `v1.7.0`.

Migrations `0013`–`0014`. DB `schemaVersion` **14**.
Backup `formatVersion` 1 / `schemaVersion` **12** (≠ DB par design).

## Objectif

Alerter sur la consommation accélérée du budget d’erreur SLO via burn-rate
multi-fenêtre — sans PromQL arbitraire, sans TSDB, sans remédiation auto
risquée.

## Rollups horaires (0013)

Table `service_reliability_hourly` : dérivés UTC, unique `(serviceKey, hourUtc)`.
Rebuild borné (48 h tick, rétention 2160 h). **Exclus** du backup.

Voir `docs/26-RELIABILITY.md` pour la précédence des buckets (partagée).

## Formule burn-rate

```text
errorBudgetFraction = (100000 - objectiveBps) / 100000
badFraction         = consumed / eligible   # unknown / maintenance = Phase 26
burnRate            = badFraction / errorBudgetFraction
```

Fenêtres **fermées** uniquement : `1h`, `6h`, `24h`, `3d`.

Paires AND :

| Paire | Fenêtres |
| ----- | -------- |
| fast  | 1h ∧ 6h  |
| slow  | 24h ∧ 3d |

États : `healthy` | `warning` | `critical` | `insufficient-data`.
Jamais `healthy` sans données éligibles.

## Politiques d’alerte (0014)

Table `slo_alert_policies` (durable, **incluse** backup → schéma 12) :

- `enabled` défaut **false**
- `warningThreshold` / `criticalThreshold` / `cooldownSeconds` / `notifyOnRecovery`
- `configRevision` (CAS)
- une politique par `sloId`

Table `slo_alert_runtime_state` (dérivée, **exclue** backup) : last state,
cooldown, last notification.

### Flux

```text
burn state transition
  → Notification Center
  → optional Web Push / ntfy via automation allowlist
```

Event fermé `slo.burn-rate.changed` — payload safe uniquement :

`serviceKey`, `sloId`, `state`, `burnRate`, `budgetRemaining`, `window`, `occurredAt`.

Dedup : même SLO + même état + cooldown → pas de tempête.
Recovery `warning|critical → healthy` seulement si une alerte avait été notifiée.
Pas d’appel push direct. Permissions runtime revalidées.

## UI

`/reliability/[serviceKey]` : panneaux burn fast/slow, budget, politique,
dernière transition / notification. États jamais couleur-only.

## Sécurité (audit close)

| Risque                         | Mitigation                                             |
| ------------------------------ | ------------------------------------------------------ |
| Injection d’event arbitraire   | registry fermé `slo.burn-rate.changed`                 |
| Action / remédiation auto      | hors scope ; Proxmox/Seerr restent manual-only         |
| Tempête d’alertes              | cooldown + dedup + disabled-by-default                 |
| Bypass RBAC                    | `reliability.read` / `slo.manage` serveur              |
| False healthy (0 data/unknown) | `insufficient-data` ; unknown exclu (Phase 26)         |
| Fuite de secrets               | payload safe ; pas de series / PromQL / URLs / erreurs |
| Overflow calcul                | bornes Zod + math fractionnelle bornée                 |
| Exécution duplicate            | runtime state + worker restart safe                    |

## Hors scope

PromQL, TSDB brut, remédiation auto, discovery réseau, scan LAN.
