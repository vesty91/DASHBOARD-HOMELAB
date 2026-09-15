# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Le versioning suit [SemVer](https://semver.org/lang/fr/) à partir de 1.0.0.
Voir ADR 0029.

## [Unreleased]

### Ajouté

- Persistence des automations (Phase 22.1) : `automation_rules`,
  `automation_runtime_state`, `automation_runs`.
- Moteur de triggers/conditions déclaratif (Phase 22.2) : intervalle,
  cron UTC 5 champs, events d'intégration/job, status-transition,
  cooldown et anti-boucle.
- Scheduler worker at-most-once (Phase 22.3) : leases DB, `runKey`,
  pas de retry des mutations externes, `unknown` après crash.
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
