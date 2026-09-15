# 22 — Automations & alerting

Statut : **IN PROGRESS** (22.1 persistence).

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
