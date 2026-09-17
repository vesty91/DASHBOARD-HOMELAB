# Homelab Dashboard

Dashboard self-hosted pour homelab et NAS. Version **1.7.0**.

Le produit centralise les boards, les applications, les widgets, les intégrations
(Docker Socket Proxy, Synology, médias, monitoring, *arr, Custom API), le RBAC,
les automations / alertes, le centre de notifications / incidents, les status
pages / fenêtres de maintenance, la fiabilité / SLO / burn-rate alerting, la
PWA / Web Push, la sauvegarde et l’OIDC. Les secrets et les appels d’API restent
côté serveur.

Identité originale. Homarr n’est qu’une référence fonctionnelle (`reference/homarr`,
lecture seule).

## Installation production

Docker Compose, PostgreSQL obligatoire. Détail : [`docs/10-DEPLOYMENT.md`](docs/10-DEPLOYMENT.md).

```bash
cp .env.production.example .env
# renseigner APP_URL, AUTH_SECRET, SECRET_ENCRYPTION_KEY, POSTGRES_PASSWORD
docker compose -f compose.yaml config
docker compose -f compose.yaml up --build
```

Images GHCR (après publication du tag `v1.7.0`) :

`ghcr.io/vesty91/dashboard-homelab/{web,worker,realtime,migrate}:1.7.0`

Définir `DASHBOARD_IMAGE_PREFIX=ghcr.io/vesty91/dashboard-homelab` et
`APP_VERSION=1.7.0`, puis `docker compose pull && docker compose up`.

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

SQLite en local. PostgreSQL en production. Migrations `0000`–`0009`
(schema 9).

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
| Notes de version    | `CHANGELOG.md`                                |
| Semver              | `docs/adr/0029-semver-and-v1-release.md`      |

`AGENTS.md` s’applique à toute modification du dépôt.
