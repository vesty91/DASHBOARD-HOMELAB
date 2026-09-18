# Homelab Dashboard

Dashboard self-hosted pour homelab et NAS. Version **1.8.0** (patch **1.8.1**
en cours — Phase 29).

Le produit centralise les boards, les applications, les widgets, les intégrations
(Docker Socket Proxy, Synology, médias, monitoring, *arr, Custom API), le RBAC,
les automations / alertes, le centre de notifications / incidents, les status
pages / fenêtres de maintenance, la fiabilité / SLO / burn-rate alerting, la
topologie / impact, la PWA / Web Push, la sauvegarde et l’OIDC. Les secrets et
les appels d’API restent côté serveur.

Identité originale. Homarr n’est qu’une référence fonctionnelle (`reference/homarr`,
lecture seule).

## État courant (contrats)

| Contrat                | Valeur                                             |
| ---------------------- | -------------------------------------------------- |
| Version produit        | `1.8.0` (tag `v1.8.0`) ; patch `1.8.1` en Phase 29 |
| Migrations DB          | `0000`–`0015` (SQLite + PostgreSQL)                |
| DB `schemaVersion`     | **15**                                             |
| Backup `formatVersion` | **1**                                              |
| Backup `schemaVersion` | **13** (compat restore 5–13)                       |

`DB schemaVersion` et `backup schemaVersion` **diffèrent volontairement** :
les tables dérivées / runtime (rollups reliability, `slo_alert_runtime_state`,
impact topologie, notifications, push, etc.) sont exclues du payload backup
et n’avancent pas le schéma d’archive.

`v1.8.0` **n’inclut pas** les hotfixes post-release `#102` / `#103`
(stabilisation E2E layout clavier). Ces correctifs partent dans `v1.8.1`.
Ne jamais déplacer le tag `v1.8.0`.

## Installation production

Docker Compose, PostgreSQL obligatoire. Détail : [`docs/10-DEPLOYMENT.md`](docs/10-DEPLOYMENT.md).

```bash
cp .env.production.example .env
# renseigner APP_URL, AUTH_SECRET, SECRET_ENCRYPTION_KEY, POSTGRES_PASSWORD
docker compose -f compose.yaml config
docker compose -f compose.yaml up --build
```

Images GHCR (tag produit) :

`ghcr.io/vesty91/dashboard-homelab/{web,worker,realtime,migrate}:1.8.0`

Après publication de `v1.8.1`, préférer `:1.8.1` (inclut les hotfixes E2E).

Définir `DASHBOARD_IMAGE_PREFIX=ghcr.io/vesty91/dashboard-homelab` et
`APP_VERSION` au tag souhaité, puis `docker compose pull && docker compose up`.

## Développement

```bash
pnpm install
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

SQLite en local. PostgreSQL en production. Migrations `0000`–`0015`
(DB `schemaVersion` 15). Backup archive `schemaVersion` 13.

## Documentation

| Sujet               | Fichier                                       |
| ------------------- | --------------------------------------------- |
| Déploiement         | `docs/10-DEPLOYMENT.md`                       |
| Sécurité / RBAC     | `docs/09-SECURITY.md`, `docs/05-AUTH-RBAC.md` |
| Intégrations        | `docs/08-INTEGRATION-SYSTEM.md`               |
| Contrats API        | `docs/13-API-CONTRACTS.md`                    |
| Roadmap             | `docs/12-ROADMAP.md`                          |
| Hardening post-v1   | `docs/20-POST-V1-HARDENING.md`                |
| Actions intégration | `docs/21-SAFE-INTEGRATION-ACTIONS.md`         |
| Automations         | `docs/22-AUTOMATIONS.md`                      |
| Notifications       | `docs/23-NOTIFICATIONS.md`                    |
| PWA / Web Push      | `docs/24-PWA.md`                              |
| Status pages        | `docs/25-STATUS-PAGES.md`                     |
| Reliability / SLO   | `docs/26-RELIABILITY.md`                      |
| Burn-rate alerting  | `docs/27-SLO-ALERTING.md`                     |
| Topologie / impact  | `docs/28-TOPOLOGY.md`                         |
| Notes de version    | `CHANGELOG.md`                                |
| Semver              | `docs/adr/0029-semver-and-v1-release.md`      |

`AGENTS.md` s’applique à toute modification du dépôt.
