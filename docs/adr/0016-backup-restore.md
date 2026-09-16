# ADR 0016 — Backup JSON versionné, validation default-deny

## Statut

Accepté. Phase 14.

## Contexte

La spec exige un export avec manifeste de version, une validation avant
mutation, un backup pré-restore, puis un restore transactionnel. L'archive
n'est pas fiable. `backup.manage` est réservé au SYSTEM_ADMIN par défaut.
Les secrets d'intégration doivent rester chiffrés (ciphertext / iv / authTag /
keyVersion). Les migrations `0000`–`0005` restent immuables.

## Décisions

### 1. Format JSON, pas de table `0006`

L'archive est un JSON borné (`homelab-dashboard-backup`, `formatVersion` 1,
`schemaVersion` / `databaseSchemaVersion` 5). Un hash SHA-256 canonique couvre
`tables.json`. Aucune table de backup persistée : pas de migration `0006`.

### 2. Vocabulaire fermé

Seules les tables et colonnes du schéma actuel sont acceptées. Toute table,
colonne ou clé inconnue est rejetée. Les champs d'allure secret en clair
(`password`, `apiKey`, `token`, …) sont refusés. `passwordHash` et le
ciphertext AES-256-GCM sont autorisés.

### 3. Pipeline

`export → manifeste + hashes → validate/preview sans mutation → backup
pré-restore → restore transactionnel → commit → effets secondaires`.
`validate` ne touche pas la DB. `restore` exige `confirm: true`. SQLite
utilise `BEGIN IMMEDIATE` ; PostgreSQL une transaction Drizzle. Un échec
fait rollback. Après commit, le cache d'intégrations est vidé au mieux ;
un échec d'effet secondaire ne défait pas le restore.

### 4. Compatibilité

La v1 Phase 14 n'acceptait que le schéma 5. La Phase 15 étend le vocabulaire au
schéma 6 et accepte encore une archive v5 (upgrade in-memory). Voir ADR 0017.

Évolutions ultérieures (toujours `formatVersion` 1) :

- Phase 22 : `schemaVersion` 7 ;
- Phase 23 : `schemaVersion` 8 — exclus aussi `notifications`,
  `incidents`, `incident_events` ;
- Phase 24 : `schemaVersion` 9 — exclus aussi `push_subscriptions`.

Tables hors archive / purge restore (éphémères) : `audit_logs`,
`auth_sessions`, `automation_runs`, `automation_runtime_state`,
`notifications`, `incidents`, `incident_events`, `push_subscriptions`.
Compat restore acceptée : 5 → 6 → 7 → 8 → 9. Schéma 10+ rejeté.
