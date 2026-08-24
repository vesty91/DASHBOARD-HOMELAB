# 17 — Carte des sources Homarr à fournir à Codex

## 1. Dépôt

Référence principale :

`https://github.com/homarr-labs/homarr`

Branche observée lors de l'audit :

`dev`

Le script fourni clone cette branche en shallow clone.

## 2. Documentation officielle

Base :

`https://homarr.dev/docs/`

Sections à consulter en priorité :

- getting started / installation ;
- boards ;
- apps ;
- integrations ;
- widgets ;
- users ;
- groups/permissions ;
- single sign-on ;
- environment variables ;
- Docker integration ;
- backup ;
- custom widgets.

## 3. Fichiers du dépôt particulièrement utiles

```text
package.json
pnpm-workspace.yaml
.env.example
LICENSE

apps/nextjs/
apps/tasks/
apps/websocket/

packages/auth/
packages/boards/
packages/db/
packages/docker/
packages/integrations/
packages/widgets/
packages/websocket/
packages/tasks/
```

## 4. Points confirmés pendant l'audit

### Monorepo

Workspace :

```text
apps/*
packages/*
tooling/*
```

### Apps

La branche `dev` contient notamment :

```text
apps/docs
apps/nextjs
apps/tasks
apps/websocket
```

### DB

Schémas séparés :

```text
packages/db/schema/sqlite.ts
packages/db/schema/mysql.ts
packages/db/schema/postgresql.ts
```

### Entités observées dans l'index schema

Notamment :

```text
accounts
apiKeys
apps
boards
layouts
items
itemLayouts
sections
sectionLayouts
users
sessions
groups
groupMembers
groupPermissions
boardGroupPermissions
boardUserPermissions
integrations
integrationSecrets
integrationItems
integrationUserPermissions
integrationGroupPermissions
serverSettings
cronJobConfigurations
customWidgetDefinitions
customWidgetSecrets
widgetSecrets
```

### Secrets environnement

Le `.env.example` observé sépare :

```text
AUTH_SECRET
SECRET_ENCRYPTION_KEY
```

et recommande une clé de chiffrement de 32 octets.

### Intégrations

Le dépôt contient un package dédié et un répertoire par intégration.

### Widgets

Le dépôt contient `packages/widgets`.

## 5. Licence

Le dépôt observé contient Apache License 2.0.

Consignes :

- conserver la référence de licence si du code est réellement repris ;
- ne pas utiliser la marque/logos sans droit ;
- privilégier réimplémentation originale.

## 6. Règle pour Codex

Lorsqu'une question fonctionnelle se pose :

1. consulter d'abord nos docs ;
2. si nécessaire, consulter Homarr pour comprendre le comportement ;
3. décrire le comportement recherché ;
4. implémenter notre propre version dans notre architecture ;
5. ne pas introduire une dépendance interne à Homarr.

## 7. Commandes de référence

PowerShell :

```powershell
.\scripts\clone-homarr-reference.ps1
```

Linux/macOS :

```bash
bash scripts/clone-homarr-reference.sh
```

Puis :

```text
reference/homarr/
```

doit être traité comme documentation locale.
