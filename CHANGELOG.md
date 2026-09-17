# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Le versioning suit [SemVer](https://semver.org/lang/fr/) à partir de 1.0.0.
Voir ADR 0029.

## [Unreleased]

## [1.8.0] — 2026-09-17

Service Topology & Impact Analysis (Phase 28). Minor backward-compatible.
Migration `0015`, DB `schemaVersion` 15, backup `schemaVersion` 13.

### Ajouté

- Dependency model (Phase 28.1) : `service_dependencies`, relation fermée
  `depends_on`, rejet des cycles (DAG), permissions `topology.read` /
  `topology.manage`, backup inclus.
- Impact engine (Phase 28.2) : `actualStatus` vs `impactStatus`
  (`none` | `at-risk` | `impacted`), `candidateRootCause` heuristique,
  event `dependency.impact.changed`, automation allowlist.
- UI (Phase 28.3) : `/topology` table + liste accessible, create/delete,
  a11y / e2e / mobile.

### Base de données

- Migration `0015` (SQLite + PostgreSQL). DB `schemaVersion` 15.
- Backup `schemaVersion` 13 (inclut `service_dependencies` ; exclut impact
  dérivé / caches runtime).

## [1.7.0] — 2026-09-17

SLO Burn-Rate Alerting (Phase 27). Minor backward-compatible.
Migrations `0013`–`0014`, DB `schemaVersion` 14, backup `schemaVersion` 12.

### Ajouté

- Hourly reliability rollups (Phase 27.1) : `service_reliability_hourly`,
  rebuild borné 48 h, rétention 2160 h, exclus du backup.
- Burn-rate engine (Phase 27.2) : fenêtres fermées 1h/6h/24h/3d, pairs
  fast (1h∧6h) / slow (24h∧3d) AND, états `healthy|warning|critical|insufficient-data`.
- Alert policies (Phase 27.3) : `slo_alert_policies` (disabled by default),
  cooldown/recovery, event `slo.burn-rate.changed` → Notification Center,
  runtime state hors backup.
- UI (Phase 27.4) : burn panels + CRUD politiques sur `/reliability/[serviceKey]`.

### Base de données

- Migrations `0013`–`0014` (SQLite + PostgreSQL). DB `schemaVersion` 14.
- Backup `schemaVersion` 12 (inclut `service_slos` + `slo_alert_policies` ;
  exclut rollups + `slo_alert_runtime_state`).

## [1.6.0] — 2026-09-16

Reliability & SLO Analytics (Phase 26). Minor backward-compatible.
Migrations `0011`–`0012`, DB `schemaVersion` 12, backup `schemaVersion` 11.

### Ajouté

- Reliability aggregation (Phase 26.1) : `@dashboard/reliability`, table
  `service_reliability_daily`, rebuild borné, worker tick, rétention 730 j,
  rollups exclus du backup.
- SLO / error budget (Phase 26.2) : `service_slos`, bases points 90_000–99_999,
  fenêtres 7/30/90, `excludeMaintenance`, CAS `configRevision`, permissions
  `reliability.read` / `slo.manage`.
- UI (Phase 26.3) : `/reliability`, export CSV formula-safe, widget
  `reliability-status` (`publicSafe: false`), `reliability.summarize`.

### Base de données

- Migrations `0011`–`0012` (SQLite + PostgreSQL). DB `schemaVersion` 12.
- Backup `schemaVersion` 11 (inclut `service_slos` ; exclut rollups).

## [1.5.0] — 2026-09-16

Status Pages & Maintenance Windows (Phase 25). Minor backward-compatible.
Migration `0010`, backup `schemaVersion` 10.

### Ajouté

- Status pages (Phase 25.1) : `@dashboard/status-pages`, tables
  `status_pages` / `status_page_services`, projection publique sans IDs
  d’intégration / URL / secrets, RBAC `status-page.read` /
  `status-page.manage`, tRPC `statusPage.*` + `getPublic` (rate limit +
  cache TTL 15s).
- Maintenance windows (Phase 25.2) : `maintenance_windows` /
  `maintenance_window_targets`, lifecycle UTC dérivé, notifications
  Notification Center, worker tick idempotent.
- UI (Phase 25.3) : admin `/status-pages*`, publique `/status/[slug]`
  (`robots: noindex`), PWA network-only pour le statut live.
- Backup `schemaVersion` 10. Compat 5 → … → 10. Config status/maintenance
  **incluse** ; runtime (notifications, incidents, push) toujours exclus.

### Base de données

- Migration `0010` (SQLite + PostgreSQL). `schemaVersion` 10.
- Pas de migration `0011` (maintenance livrée dans `0010`).

## [1.4.0] — 2026-09-16

Progressive Web App sécurisée & Web Push (Phase 24). Minor backward-compatible.
Migration `0009`, backup `schemaVersion` 9.

### Ajouté

- PWA (Phase 24.1) : manifest, icônes Homelab Dashboard, service worker
  sécurisé (pas de cache HTML auth / API / tRPC), shell `/offline.html`.
- Web Push VAPID (Phase 24.2) : `push_subscriptions` chiffrées, tRPC
  `push.*`, delivery depuis Notification Center, SW `push` /
  `notificationclick`, payload lock-screen minimal.
- UX mobile (Phase 24.3) : safe-area, touch targets shell ≥ 44px,
  préférences push enable / disable device / disable all — pas de bouton
  Install universel.
- Backup `schemaVersion` 9. Compat 5 → 6 → 7 → 8 → 9. Schéma 10+ rejeté.
  `push_subscriptions` (avec `notifications`, `incidents`,
  `incident_events`) exclus de l'archive.

### Base de données

- Migration `0009` (SQLite + PostgreSQL). `schemaVersion` 9.
- Table `push_subscriptions` éphémère hors backup / hors restore.

## [1.3.0] — 2026-09-16

Notification Center & Incidents (Phase 23). Minor backward-compatible.
Migration `0008`, backup `schemaVersion` 8.

### Ajouté

- Persistence notifications in-app (Phase 23.1) : `notifications`,
  catégories / sévérités fermées, déduplication, rétention worker.
- Incidents disponibilité (Phase 23.2) : `incidents` / `incident_events`,
  open / resolve sur `integration.status.changed`, timeline.
- UI Notification Center (Phase 23.3) : badge shell, `/notifications`,
  `/incidents`, realtime user-scoped.
- Permissions `notification.read.self` / `notification.manage.self` /
  `incident.read` (ADMIN default-deny).
- Backup `schemaVersion` 8. Compat 5 → 6 → 7 → 8. Schéma 9+ rejeté.
  `notifications`, `incidents`, `incident_events` exclus de l'archive.

### Base de données

- Migration `0008` (SQLite + PostgreSQL). `schemaVersion` 8.
- Tables éphémères hors backup / hors restore.

## [1.2.0] — 2026-09-16

Automations & alerting (Phase 22). Minor backward-compatible.
Migration `0007`, backup `schemaVersion` 7.

### Ajouté

- Persistence des automations (Phase 22.1) : `automation_rules`,
  `automation_runtime_state`, `automation_runs`.
- Moteur de triggers/conditions déclaratif (Phase 22.2) : intervalle,
  cron UTC 5 champs, events d'intégration/job, status-transition,
  cooldown et anti-boucle.
- Scheduler worker at-most-once (Phase 22.3) : leases DB, `runKey`,
  pas de retry des mutations externes, `unknown` après crash.
- Registry d'actions automation (Phase 22.4) : default-deny,
  `runSafeIntegrationAction`, audit `source=automation`.
- Alerting status-transition (Phase 22.5) : DOWN/recovery ntfy,
  debounce `forDurationSeconds`, cooldown anti-tempête.
- UI automations (Phase 22.6) : `/automations`, wizard (création
  désactivée), dry-run sans side effect, manual run, historique.
- Permissions `automation.read` / `automation.manage` / `automation.run`
  (ADMIN default-deny).
- Backup `schemaVersion` 7. Compat 5 → 6 → 7. Schéma 8+ rejeté.

### Base de données

- Migration `0007` (SQLite + PostgreSQL). `schemaVersion` 7.
- Rétention des runs : 30 jours et 200 par règle.
- Restore : les leases et l'historique de runs ne sont pas restaurés.

## [1.1.0] — 2026-09-15

Actions d'intégration sûres (Phase 21). Minor backward-compatible.
Schéma et backup inchangés.

### Ajouté

- Framework `runSafeIntegrationAction` (RBAC conjonctif, POST allowlisté,
  rate limit, audit, cache/realtime après succès).
- Proxmox : start / shutdown / reboot (QEMU + LXC).
- qBittorrent : pause / resume (hashs explicites, jamais `all`).
- ntfy : publish (topic, message, titre, priorité, tags bornés).
- Sonarr : `RefreshSeries` et `EpisodeSearch` (un ID).
- Radarr : `RefreshMovie` et `MoviesSearch` (un `movieId`).
- Seerr : approve / decline (un `requestId`).

### Sécurité

- Default deny : `*.read` et `integration.manage` seuls ne suffisent pas.
- Prowlarr, Grafana et Custom API restent lecture seule / GET-only.

## [1.0.1] — 2026-09-15

Post-v1 hardening (Phase 20). Schéma et backup inchangés.

### Sécurité

- Next.js 16.3.5 (GHSA RCE 16.3.2).
- `ws` 8.21.3.
- HSTS appliqué au runtime si `APP_URL` est `https:`.

### Qualité

- Navigation clavier du board, axe WCAG 2A/2AA, Lighthouse CI.
- Actions GitHub en runtime Node 24.
- Smoke HTTPS reverse-proxy (Caddy) + WebSocket.

## [1.0.0] — 2026-09-15

Première release stable. Schéma Drizzle 6, backup `formatVersion` 1 /
`schemaVersion` 6. Aucune migration `0007`.

### Ajouté

- Boards (desktop / mobile), widgets, catalogue d’applications.
- Auth locale, RBAC, OIDC générique, sessions révocables, journal d’audit.
- Backup / restore JSON (secrets chiffrés, preview default-deny).
- Worker et realtime optionnels (Redis), SSE et WebSocket.
- Intégrations lecture seule : Docker, Synology DSM, Jellyfin, Immich, Beszel,
  Uptime Kuma, Prometheus, Proxmox VE, Grafana, ntfy, Sonarr, Radarr, Prowlarr,
  qBittorrent, Seerr (Jellyseerr / Overseerr), Custom API.
- Images Compose multi-target, health live/ready, pipeline GHCR `vX.Y.Z`
  (tags HCL, pas une liste CSV dans `bake-action` `set`).

### Sécurité

- Secrets AES-256-GCM, jamais renvoyés en clair.
- Politique SSRF, TLS vérifié, pas de socket Docker monté dans l’app.
- CSP sans `'unsafe-eval'`, tRPC POST-only, rate limits des actions sensibles.

### Compatibilité

- Restore d’archives backup `schemaVersion` 5 et 6.
- `appVersion` 0.1.0 dans une archive reste accepté (métadonnée, pas un gate).

## [0.1.0] — 2026-08-24

Bootstrap interne (phases 1–18). Non publié comme tag semver.
