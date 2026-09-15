# 22 — Automations & alerting

Statut : **IN PROGRESS** (22.3 scheduler).

Phase 22. Migration `0007`. `schemaVersion` 7. Backup `formatVersion` 1.

Ce n'est **pas** un n8n / shell / eval / webhook proxy / REST proxy.

## 22.1 Persistence

Tables :

- `automation_rules` — définition (export backup)
- `automation_runtime_state` — leases / nextRun (non exporté)
- `automation_runs` — historique borné (non exporté)

Règles :

- `enabled` défaut `false`
- `configRevision` CAS (CONFLICT)
- pas de snapshot de permissions
- `ownerUserId` ON DELETE SET NULL
- runs ON DELETE SET NULL (rétention 30 jours et 200 / règle)
- JSON borné, clés sensibles interdites
- trigger/action allowlistés
- restore : `automation_runs` et `automation_runtime_state` sont purgés
  (données éphémères, hors backup)

Permissions : `automation.read` / `automation.manage` / `automation.run`.
`ADMIN` ne les reçoit pas. `SYSTEM_ADMIN` : catalogue.

Backup : schéma 7. Restore 5 → 6 → 7 et 6 → 7. Schéma 8+ rejeté.

## 22.2 Triggers et conditions

IN PROGRESS côté scheduler (22.3). Moteur déclaratif livré :

- schedule : `interval` (minimum 1 minute) et cron 5 champs **UTC** ;
- event : `integration.status.changed`, `integration.data.changed`, `job.failed` ;
- status-transition : `from` / `to` sur `integration.status.changed` + `lastObservedStatus` ;
- conditions : `eq` `neq` `lt` `lte` `gt` `gte` `contains` `and` `or` ;
- champs fermés par trigger ;
- cooldown + skip si `causationAutomationId` = automationId.

Pas d'eval, pas de JS, pas de cron shell, pas d'événements `board.*`.

## 22.3 Scheduler worker

Le moteur tourne dans `apps/worker` (pas de daemon séparé).

- scan borné (100) et concurrence 4 ;
- lease DB CAS, TTL 60 s, replicas multiples ;
- `runKey` unique ; claim du run **avant** dispatch ;
- at-most-once : pas de retry automatique des side effects ;
- crash après claim / dispatch → `unknown` ;
- SIGTERM : stop claiming, drain borné, release lease ;
- Redis down : le schedule DB continue, ingest events `degraded` ;
- `/health/ready` expose `automationScheduler` sans configs ni secrets.

Le dispatcher 22.3 est `ACTION_NOT_WIRED` (skip, aucun side effect externe).
22.4 branchera `runSafeIntegrationAction`.
