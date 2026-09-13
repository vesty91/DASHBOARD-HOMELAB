# 12 — Roadmap d'implémentation

## Phase 0 — Documentation

Statut : COMPLETE.

Livrables :

- docs validées ;
- backlog ;
- architecture ;
- risques ;
- choix stack.

Gate : aucune implémentation métier avant validation.

## Phase 1 — Skeleton

Statut : COMPLETE.

Livrables :

- pnpm workspace ;
- Turborepo ;
- apps/web ;
- packages fondamentaux ;
- TypeScript strict ;
- lint ;
- format ;
- tests ;
- CI locale ;
- env validation.

Gate :

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

verts.

## Phase 2 — DB

Statut : COMPLETE.

Livrables :

- Drizzle ;
- SQLite dev ;
- PostgreSQL prod ;
- users/groups/boards/layouts/items/apps/integrations/secrets ;
- migrations ;
- repositories.

## Phase 3 — Auth/RBAC

Statut : COMPLETE.

Livrables :

- onboarding admin ;
- login/logout ;
- session ;
- roles ;
- permission resolver ;
- pages admin minimales.

## Phase 4 — Board Engine

Statut : COMPLETE.

Livrables :

- board CRUD ;
- layouts desktop/mobile ;
- grid ;
- item placement ;
- resize ;
- autosave ;
- revision conflicts.

Milestone : premier board réellement utilisable.

## Phase 5 — Apps

Statut : COMPLETE.

Livrables :

- CRUD app ;
- URL ;
- icon ;
- health status.

## Phase 6 — Widget Engine

Statut : COMPLETE.

Livrables :

- registry ;
- Clock ;
- Bookmarks ;
- App Tile ;
- config forms ;
- error/loading states.

## Phase 7 — Integration Framework

Statut : COMPLETE.

Livrables :

- registry ;
- config/secrets séparés ;
- encryption ;
- test connection ;
- capabilities ;
- error types ;
- cache.

Aucun adapter de production n'est enregistré. Docker, Synology et les autres intégrations restent Phase 8+.

## UI redesign

Statut : COMPLETE / merged (PR #7).

Livrables :

- AppShell ;
- design system ;
- pages Boards / Apps / Integrations / Admin ;
- focus trap et ACL edit actions.

## Phase 7.5 — Application Library

Statut : COMPLETE / merged (PR #8).

Livrables :

- AppDefinition registry ;
- curated app catalog ;
- local icons ;
- search/categories ;
- custom app fallback ;
- Docker discovery metadata only.

Aucune connexion Docker. Aucune migration DB.

## Phase 7.6 — App Library Hardening & Expansion

Statut : COMPLETE / merged (PR #9), tag `phase-7-6-complete`.

Livrables :

- cycle de vie `active` / `legacy` / `retired` ;
- relations `replacedBy` validées ;
- expansion curatée du catalogue ;
- metadata Docker discovery conservées pour les apps legacy ;
- icônes locales uniquement.

Aucune connexion Docker. Aucune migration DB.

## Phase 8 — Docker

Statut : COMPLETE / merged (PR #10), tag `phase-8-complete`.

Livrables :

- premier adapter de production `docker` via socket proxy HTTP(S) ;
- négociation API Engine `1.40`–`1.55` ;
- list / inspect / health / stats one-shot / logs bornés ;
- start / stop / restart permissionnés ;
- allowlist exacte d'endpoints ;
- reconnaissance via App Library ;
- pages `/integrations/[id]` et `/integrations/[id]/containers/[containerId]`.

Hors scope : widgets Docker, realtime, inventaire `/images/json`, socket Unix direct.

## Phase 9 — Synology

Statut sur la branche `phase-9-synology` : IMPLEMENTED / REVIEW.

Livrables :

- adapter `synology` via l'API DSM officielle (Info, Auth, DSM.Info, Core.System, Utilization, Storage) ;
- informations système (modèle, version DSM, uptime, RAM, température si disponibles) ;
- CPU et RAM réels lorsque l'API Utilization répond ;
- volumes et disques (capacité, utilisé / libre, état, SMART si exposé) ;
- vue partielle `available` / `degraded` / `unavailable` ;
- 2FA via appareil de confiance (`deviceId` server-managed) ;
- credentials côté serveur, TLS / CA privée, timeout, SSRF, DTO assainis ;
- refresh manuel rate-limité (10/min), cache 15 s / 5 s.

Hors scope : widgets Synology, FileStation, reboot, polling, Phase 10.

## Phase 10 — Jellyfin

Livrables :

- info server ;
- sessions ;
- streams ;
- transcode.

## Phase 11 — Immich

Livrables :

- server stats ;
- storage ;
- media counts ;
- widget.

## Phase 12 — Monitoring

Livrables :

- Beszel ;
- Uptime Kuma ;
- Prometheus ;
- service status.

## Phase 13 — Worker + realtime

Livrables :

- Redis ;
- jobs ;
- WebSocket/SSE ;
- pub/sub ;
- stats live.

## Phase 14 — Backup/Restore

Livrables :

- export ;
- manifest ;
- validation ;
- restore ;
- migration compatibility.

## Phase 15 — SSO + Admin avancé

Livrables :

- OIDC ;
- groups mapping ;
- audit logs ;
- sessions management.

## Phase 16 — Hardening

Audit :

- RBAC ;
- SSRF ;
- CSRF ;
- XSS ;
- CSP ;
- Docker ;
- secrets ;
- rate limit ;
- backup.

## Phase 17 — Production

Livrables :

- image Docker ;
- Compose ;
- multi-arch ;
- health/readiness ;
- upgrade docs ;
- backup docs ;
- release pipeline.

## Phase 18 — Extensions

- Proxmox ;
- Grafana ;
- ntfy ;
- Sonarr ;
- Radarr ;
- Prowlarr ;
- qBittorrent ;
- Jellyseerr ;
- custom API widgets.

## Règle

Ne jamais ouvrir la phase N+1 si les gates qualité critiques de N sont rouges.
