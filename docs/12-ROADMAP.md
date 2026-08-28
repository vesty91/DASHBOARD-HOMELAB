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

Statut : implémentée sur la branche `phase-7-integration-framework`, en review.

Livrables :

- registry ;
- config/secrets séparés ;
- encryption ;
- test connection ;
- capabilities ;
- error types ;
- cache.

Aucun adapter de production n'est enregistré. Docker, Synology et les autres intégrations restent Phase 8+.

## Phase 8 — Docker

Livrables :

- containers ;
- status ;
- health ;
- stats ;
- logs bornés ;
- start/stop/restart ;
- socket proxy docs.

## Phase 9 — Synology

Livrables :

- system ;
- CPU/RAM ;
- volumes ;
- storage ;
- disks ;
- temperatures selon API ;
- états dégradés explicites.

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
