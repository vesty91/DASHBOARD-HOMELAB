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

Statut : COMPLETE / merged (PR #11), tag `phase-9-complete`.

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

Statut : COMPLETE (`phase-10-complete`).

Livrables :

- adapter `jellyfin` via l'API officielle (`/System/Info`, `/Sessions`) ;
- info serveur (nom, version, produit, OS) ;
- sessions actives et lecture en cours ;
- mode direct play / direct stream / transcode sans invention ;
- widget `jellyfin-sessions` (`publicSafe=false`) ;
- permissions `jellyfin.read` ;
- cache 8 s / 5 s, coalescer, refresh 10/min.

Hors scope : contrôle de lecture, users admin, transcode jobs, Phase 11.

## Phase 11 — Immich

Statut : COMPLETE (`phase-11-complete`).

Livrables :

- adapter `immich` via l'OpenAPI officielle (`/api/server/*`) ;
- version / santé / stockage / comptes photos-vidéos ;
- widget `immich-stats` (`publicSafe=false`) ;
- permission `immich.read` ;
- cache 15 s / 8 s, coalescer, refresh 10/min.

Hors scope : jobs, EXIF, thumbnails, `usageByUser`, Phase 12.

## Phase 12 — Monitoring

Statut : COMPLETE (`phase-12-complete`).

Livrables :

- Beszel : adapter HTTP+Zod, `beszel.read`, widget `beszel-hosts`
  (`publicSafe=false`) ;
- Uptime Kuma : adapter `GET /metrics` + Basic auth, `uptime-kuma.read`,
  widget `uptime-kuma-status` (`publicSafe=false`) ;
- Prometheus : adapter `POST /api/v1/query` + `query_range`, `prometheus.read`,
  widget `prometheus-metric` (`publicSafe=false`) ;
- service status : agrégateur interne `service-status` (`publicSafe=false`),
  pas de nouvelle intégration externe.

## Phase 13 — Worker + realtime

Statut : COMPLETE.

Livrables :

- Redis optionnel (PING protocole, jamais source de vérité RBAC) ;
- jobs persistés (`0005`, `jobs.list` + `settings.read`) ;
- tickets HMAC scopés, événements board/intégration, live stats (signal + refetch) ;
- SSE `/events` et WebSocket `/ws` avec le même filtre serveur ;
- heartbeat, health/live, health/ready, reconnect, backpressure, fallback polling.

## Phase 14 — Backup/Restore

Statut : COMPLETE / merged (PR #25), tag `phase-14-complete`.

Livrables :

- export JSON + manifeste versionné `homelab-dashboard-backup`
  (`formatVersion` 1, `schemaVersion` 5) + SHA-256 (`AC-015`) ;
- validation default-deny / preview sans mutation (`AC-016`) ;
- backup pré-restore écrit sur disque avant mutation, puis restore
  transactionnel ;
- secrets conservés chiffrés (ciphertext / iv / authTag / keyVersion) ;
- permission unique `backup.manage` ;
- compatibilité : schéma 5 uniquement.

Hors scope : migration `0006`, OIDC, group mapping, audit logs, session
management (Phase 15).

## Phase 15 — SSO + Admin avancé

Statut : COMPLETE / merged (PR #27).

Livrables :

- OIDC générique (Authorization Code + PKCE, state, nonce) ;
- association d'identité `issuer + sub` ;
- mapping de groupes default-deny ;
- audit logs serveur + UI `/admin/audit` (`audit.read`) ;
- gestion des sessions (`auth_sessions`, révocation immédiate).

## Phase 16 — Hardening

Statut : COMPLETE / merged (PR #29).

Livrables :

- headers HTTP + CSP enforcement (sans `'unsafe-eval'`) ;
- CSRF : `allowedOrigins`, tRPC POST-only, `backup.export` en mutation ;
- rate limit backup / OIDC / sessions / setup ;
- origine realtime vs `APP_URL` ;
- OIDC nonce (présence + replay, pas d'auto-comparaison) ;
- cookies session HttpOnly / SameSite / Secure ;
- tests de non-régression (RBAC, Docker exec POST, backup trop gros).

Hors scope : Phase 17 (image Docker, Compose prod, multi-arch, release).

## Phase 17 — Production

Statut : COMPLETE / merged (PR #31), close docs.

Livrables :

- Dockerfile multi-target `web` / `worker` / `realtime` / `migrate`
  (Node 24 bookworm-slim, pnpm 11.23.0, non-root uid 10001) ;
- Compose production : postgres 18, redis 7.4, migrate oneshot, web, worker,
  realtime ; postgres/redis non publiés ; volume `appdata` pour backup
  pré-restore ;
- `GET /health/live` (process) et `GET /health/ready` (SELECT 1, pas Redis,
  pas d'intégrations) ;
- graceful shutdown SIGTERM/SIGINT borné ;
- Caddy/Nginx + rewrite WebSocket `/api/realtime/ws` ;
- tests fresh install Compose + AC-024 schema 5→6 SQLite/PostgreSQL ;
- GHCR multi-arch sur tags semver `v*.*.*` uniquement ;
- docs install / upgrade / rollback / backup Phase 14.

Hors scope : tag semver `v1.0.0` (le package reste `0.1.0`), Phase 18,
migration `0007`.

## Phase 18 — Extensions

Statut : COMPLETE / merged (PRs #33–#41).

Livrables :

- Proxmox VE (`proxmox`, widget `proxmox-resources`, `proxmox.read`, ADR 0020) ;
- Grafana (`grafana`, widget `grafana-status`, `grafana.read`, ADR 0021) ;
- ntfy (`ntfy`, widget `ntfy-status`, `ntfy.read`, ADR 0022) ;
- Sonarr (`sonarr`, widget `sonarr-overview`, `sonarr.read`, ADR 0023) ;
- Radarr (`radarr`, widget `radarr-overview`, `radarr.read`, ADR 0024) ;
- Prowlarr (`prowlarr`, widget `prowlarr-status`, `prowlarr.read`, ADR 0025) ;
- qBittorrent (`qbittorrent`, widget `qbittorrent-transfer`,
  `qbittorrent.read`, ADR 0026) ;
- Seerr / Jellyseerr / Overseerr (`seerr`, widget `seerr-requests`,
  `seerr.read`, ADR 0027) ;
- Custom API (`custom-api`, widget `custom-api-value`, `custom-api.read`,
  ADR 0028).

Lecture seule, SSRF, secrets serveur, DTO assainis, `publicSafe=false`.
Aucune migration `0007`. Custom API n'est pas une source `service-status`.

Hors scope : mutations (VM, torrents, ntfy publish, commandes *arr),
proxy générique, URL widget arbitraire, tag semver `v1.0.0` (Phase 19).

## Phase 19 — V1.0 Release & Final Stabilization

Statut : COMPLETE.

Livrables :

- version produit `1.0.0` (`APP_VERSION`, health, Compose, backup metadata) ;
- politique semver (ADR 0029) : prerelease GHCR sans `latest` ;
- régression E2E / upgrade schéma 5→6 / smoke Compose ;
- correctifs a11y (skip link, focus trap suppression widget, menu mobile) ;
- README, CHANGELOG, notes de stabilisation ;
- tags `phase-19-complete` et `v1.0.0` sur le même commit.

Hors scope : migration `0007`, mutations d’intégrations Phase 18, bump des
`package.json` internes.

## Phase 20 — Post-V1 Hardening & Quality

Statut : **COMPLETE**.

Livrables :

- accessibilité clavier GridStack (sans remplacer le moteur souris) ;
- axe Playwright WCAG 2A/2AA sur les pages principales ;
- Lighthouse CI + budgets (perf ≥ 0.85, a11y / best-practices / SEO ≥ 0.90) ;
- GitHub Actions Node 24, pinning majors, SBOM/provenance inchangés ;
- smoke HTTPS Caddy + WebSocket realtime + headers + DB down ;
- audit dépendances : Next.js **16.3.5**, `ws` **8.21.3** ;
- warning Windows standalone path length documenté (pas un hack de build).

Schéma DB inchangé (`0000`–`0006`, pas de `0007`). Backup `formatVersion` 1 /
`schemaVersion` 6. Pas de mutations d’intégrations (Phase 21).

PRs : #46–#51. Tag `phase-20-complete`. Patch `v1.0.1`.

Hors scope : Phase 21 (écritures d’intégrations), `0007`, déplacement de
`v1.0.0`.

## Phase 21 — Safe Integration Actions

Statut : **COMPLETE**.

Livré :

- framework commun (`runSafeIntegrationAction`) : RBAC conjonctif, POST
  allowlisté, rate limit, audit succès, cache + realtime après succès ;
- Proxmox : `start` / `shutdown` / `reboot` (QEMU + LXC) ;
- qBittorrent : `pause` / `resume` (hashs explicites, jamais `all`) ;
- ntfy : `publish` (topic/message/titre/priorité/tags bornés) ;
- Sonarr : `RefreshSeries` + `EpisodeSearch` (un ID) ;
- Radarr : `RefreshMovie` + `MoviesSearch` (un `movieId`) ;
- Seerr : `approve` / `decline` (un `requestId`).

Prowlarr reste **read-only** (pas de mutation utile, ciblée et non destructive).
Grafana reste **read-only**. Custom API reste **GET-only**.

Schéma DB inchangé (`0000`–`0006`, pas de `0007`). Backup `formatVersion` 1 /
`schemaVersion` 6.

PRs : #53–#59. Tag `phase-21-complete`. Minor `v1.1.0`.

Hors scope : invoke arbitraire, REST proxy.

## Phase 22 — Automations & Alerting

Statut : **IN PROGRESS**.

Livrables prévus :

- automation rules persistées (`0007`, schema 7) ;
- scheduler worker ;
- trigger registry ;
- condition engine déclaratif ;
- safe action registry ;
- authorization runtime (pas de snapshot de privilèges) ;
- cooldown / anti-loop ;
- run history bornée ;
- UI automations ;
- audit ;
- backup compatibility 5/6/7 ;
- tests concurrency ;
- release SemVer minor.

Hors scope : n8n générique, shell, eval, webhook/REST proxy, cron shell,
Custom API write, Grafana/Prowlarr write.

## Règle

Ne jamais ouvrir la phase N+1 si les gates qualité critiques de N sont rouges.
