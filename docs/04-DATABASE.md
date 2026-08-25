# 04 — Modèle de données

## 1. Principes

- IDs CUID2/UUID ;
- timestamps UTC ;
- contraintes FK explicites ;
- indexes sur recherches fréquentes ;
- JSON seulement pour config réellement polymorphe ;
- secrets séparés de la config non sensible ;
- soft delete seulement si besoin métier réel.

## 2. Entités principales

## users

```text
id
username
email
displayName
passwordHash
status
isSystemAdmin
createdAt
updatedAt
lastLoginAt
```

## sessions / accounts

Gérés avec Auth.js selon adapter.

## groups

```text
id
name
description
createdAt
updatedAt
```

## group_members

```text
groupId
userId
createdAt
```

Unique `(groupId,userId)`.

## permissions

La liste des permissions peut être statique dans le code.

Tables d'association :

```text
group_permissions
user_permissions (optionnel)
```

## boards

```text
id
slug
name
description
visibility
ownerUserId nullable
themeJson
settingsJson
revision
createdAt
updatedAt
```

Unique `slug`.

## board_user_permissions

```text
boardId
userId
permission
```

## board_group_permissions

```text
boardId
groupId
permission
```

## layouts

```text
id
boardId
name
breakpoint
columns
rowHeight
sortOrder
createdAt
updatedAt
```

Unique conseillé `(boardId, breakpoint, name)`.

## items

```text
id
boardId
widgetType
widgetVersion
title
configJson
integrationId nullable
createdAt
updatedAt
```

## item_layouts

```text
id
itemId
layoutId
x
y
w
h
minW nullable
minH nullable
maxW nullable
maxH nullable
```

Unique `(itemId,layoutId)`.

## sections

Phase 1.5 :

```text
id
boardId
name
sortOrder
settingsJson
```

## apps

```text
id
name
description
url
iconRef
color
healthcheckEnabled
healthcheckConfigJson
integrationId nullable
createdAt
updatedAt
```

## integrations

```text
id
type
name
baseUrl
enabled
configJson
status
lastCheckedAt
createdBy
createdAt
updatedAt
```

## integration_secrets

```text
id
integrationId
key
ciphertext
iv
authTag
keyVersion
createdAt
updatedAt
```

Unique `(integrationId,key)`.

## integration_permissions

Peut être normalisé en deux tables user/group, ou géré par règles génériques.

Permissions séparées :

- use ;
- interact ;
- manage.

## widget_secrets

Pour custom widgets uniquement si nécessaire.

## monitor_checks

```text
id
targetType
targetId
status
latencyMs
checkedAt
errorCode nullable
```

Prévoir politique de rétention.

## jobs

```text
id
type
status
scheduledAt
startedAt
finishedAt
attempt
errorCode
errorMessageSafe
metadataJson
```

## audit_logs

```text
id
actorUserId nullable
action
resourceType
resourceId nullable
result
ipHashOrAddressPolicy
metadataJson
createdAt
```

Ne pas inclure de secret.

## server_settings

Clé/valeur typée ou lignes dédiées.

## 3. Indexes minimaux

```text
boards.slug UNIQUE
items.boardId
layouts.boardId
itemLayouts.layoutId
apps.name
integrations.type
integrations.status
monitorChecks(targetType,targetId,checkedAt)
auditLogs(createdAt)
jobs(status,scheduledAt)
```

## 4. Transactions

Obligatoires pour :

- création board + layouts par défaut ;
- duplication board ;
- suppression board ;
- restore backup ;
- modification group permissions en bulk.

## 5. Suppression d'une intégration

Avant suppression :

- détecter widgets/apps dépendants ;
- demander comportement ;
- refuser silencieusement de casser les références.

Options :

- detach ;
- delete dependents ;
- cancel.

## 6. Migration

Chaque migration doit :

- être monotone ;
- être testée sur DB vide ;
- être testée sur snapshot précédent ;
- documenter les changements destructifs.

## 7. Backup schema version

Le manifest doit contenir :

```json
{
  "formatVersion": 1,
  "databaseSchemaVersion": "...",
  "appVersion": "...",
  "createdAt": "..."
}
```

## 8. Implémentation Phase 2

Les schémas sources sont `packages/db/src/schema/sqlite.ts` et
`packages/db/src/schema/postgresql.ts`. Les migrations initiales versionnées se trouvent dans
`packages/db/drizzle/{sqlite,postgresql}`.

La Phase 2 implémente uniquement : users, groups, group_members, boards, layouts, items, item_layouts,
apps, integrations, integration_secrets et server_settings. Auth.js, permissions métier, jobs,
monitoring et backup restent hors périmètre.

### Suppressions et relations

- user supprimé : memberships en cascade ; propriétaire de board et créateur d'intégration à NULL ;
- board supprimé : layouts et items en cascade, puis placements en cascade ;
- layout ou item supprimé : placements correspondants en cascade ;
- intégration supprimée : secrets en cascade ; références apps/items à NULL ;
- groupe supprimé : memberships en cascade.

### Server settings

`server_settings` est un singleton contrôlé (`id = global`) avec colonnes typées `schemaVersion` et
`instanceName`. Ce choix évite une table key/value libre ; de nouvelles colonnes seront ajoutées par
migration lorsque des réglages persistants apparaîtront.

### Repositories et transactions

Les repositories User, Group, Board, App et Integration exposent `findById`, `list` et `create` pour
les deux dialectes. La création board + layouts utilise une transaction réelle et son rollback est
testé. Aucun driver SQL n'est exporté vers `apps/web`.

## 9. Extension Phase 3

La Phase 3 ajoute `usernameCanonical`, `authVersion`, `user_credentials`, `roles`,
`role_permissions`, `user_roles`, `group_roles` et l'état typé `onboardingCompleted`. Les migrations
`0001` SQLite/PostgreSQL conservent les données Phase 2 et initialisent les cinq rôles. L'onboarding
SQLite utilise `BEGIN IMMEDIATE`; PostgreSQL utilise transaction, verrou de ligne et verrou advisory.

Avant le backfill de `usernameCanonical`, l'upgrade refuse explicitement une base Phase 2 contenant
plusieurs usernames qui deviennent identiques en minuscules. Chaque fichier de migration est exécuté
dans une transaction : en cas de `USERNAME_CANONICAL_COLLISION`, aucun utilisateur n'est renommé ou
supprimé et aucun changement Phase 3 n'est conservé. L'administrateur doit résoudre manuellement les
doublons dans la base Phase 2, puis relancer la migration.

La création d'un groupe avec son rôle et son membre initial optionnel est également une opération
repository atomique pour SQLite et PostgreSQL. Une référence de rôle ou d'utilisateur invalide annule
l'ensemble de la création.
