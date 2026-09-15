# 19 — Stabilisation v1.0.0

Notes d’audit Phase 19. Pas de nouvelle intégration. Pas de `0007`.

## Régression

Couverture existante conservée : onboarding, login/logout, boards, widgets,
ACL, backup, SSO admin, headers, health, et E2E par intégration (Docker,
Synology, Jellyfin, Immich, Beszel, Uptime Kuma, Prometheus, Proxmox, Grafana,
ntfy, Sonarr, Radarr, Prowlarr, qBittorrent, Seerr, Custom API, service-status).

Upgrade schéma : `packages/db/src/migration-upgrade.test.ts` (jusqu’à `0006`)
et AC-024 schema 5→6. Smoke Compose : `pnpm test:production`.

## Accessibilité

Constat :

- skip link `Aller au contenu` → `#contenu-principal` déjà présent ;
- `Dialog` / `ConfirmDialog` avec focus trap ;
- suppression de widget du board editor hors du trap partagé.

Correctifs v1 :

- `ConfirmDialog` pour la suppression de widget ;
- `aria-expanded` / `aria-controls` sur les menus et le tiroir mobile ;
- focus trap du tiroir de navigation mobile ;
- `tabIndex={-1}` sur `<main>` pour la cible du skip link ;
- E2E skip link après login.

Limites restantes : drag GridStack souris-first (redimensionnement clavier
partiel via boutons Configurer / Supprimer). Contraste dark-first, non mesuré
en CI Lighthouse.

## Performance

- Adapters : cache, coalescer, fence, refresh 10/min, listes bornées
  (Grafana `limit=100`, Custom API 8 endpoints, body 256 KiB).
- Health ready = `SELECT 1` uniquement.
- Redis non persisté, hors ready web.

Pas de refactor N+1 des resolveurs board : le coalescer d’intégration absorbe
les doublons d’overview. Listes non bornées restantes : inventaire Docker
complet d’un daemon (déjà le contrat Phase 8).

## Sécurité

Réaudit documentaire + tests existants (RBAC négatif, SSRF, headers, backup
trop gros, Docker exec POST refusé, Custom API allowlist GET).

Correctif pipeline : un tag prerelease ne publie plus `latest` / `1` / `1.0`.

## Images

CI PR : bake amd64 + `pnpm test:production`. Publication multi-arch : tag
`v1.0.0` uniquement. Pas de tag `v1.0.0-rc.*` pour cette coupe (même commit
que la stable ; un RC écraserait inutilement le registre).
