# ADR 0019 — Conteneurs production, Compose et release

## Statut

Accepté. Phase 17 COMPLETE.

## Contexte

Les phases 1–16 livrent un monorepo pnpm/Turbo fonctionnel, mais pas d'image
de production, pas d'orchestration migrate-once, ni de pipeline GHCR. Redis
reste optionnel pour le core web (ADR 0015). Les migrations `0000`–`0006`
sont immuables. Le backup Phase 14 écrit un fichier pré-restore sur disque.

## Décisions

### 1. Un Dockerfile, quatre targets

Targets `web`, `worker`, `realtime`, `migrate`. Moins de duplication qu'un
Dockerfile par app. Build multi-stage, pnpm `11.23.0`, Node 24 bookworm-slim
(argon2 natif). Runtime non-root uid/gid `10001`. Aucun secret en ARG/ENV
d'image. Next.js `output: "standalone"`. Worker/realtime/migrate sont bundlés
esbuild ESM (`dist/*.mjs`). `pg` reste externe (require CJS de Node) et
est copié via un stage `npm install pg@8.16.3`.

### 2. Migrate oneshot

Seul le service Compose `migrate` exécute le migrator Drizzle PostgreSQL
(journal `__drizzle_migrations`). web/worker/realtime **ne** migrent pas.
`restart: "no"`. Les apps dépendent de `service_completed_successfully`.
Pas de retry infini. SQLite reste le chemin dev/test ; la production exige
`DB_DRIVER=postgres`.

### 3. Redis

Présent dans Compose pour worker/realtime. Persistence Redis désactivée
(`--save ""`, pas d'AOF) : ce n'est pas la source de vérité. Non publié.
`/health/ready` web ne sonde pas Redis.

### 4. Health

`GET /health/live` : process only (AC-021). `GET /health/ready` web : `SELECT 1`
borné. Intégrations externes exclues. DTO `{ status, version }`.

### 5. Registry et tags

GHCR `ghcr.io/vesty91/dashboard-homelab/{web,worker,realtime,migrate}`.
Publication uniquement sur tags semver `vX.Y.Z` (`latest`, `X.Y`, `X`, SHA).
Les tags `phase-*` ne publient pas `latest`. PR : quality + build amd64.
Pas de bump automatique vers v1.0.0.

### 6. Backup path

Volume nommé `appdata` → `/appdata/backups` (`BACKUP_DIR`). Le format
d'archive Phase 14 n'est pas modifié.

### 7. Proxy et forwarded headers

Caddy/Nginx devant `127.0.0.1:3000`. WebSocket via rewrite
`/api/realtime/ws`. IP d'audit toujours nulle (ADR 0003) : pas de confiance
`X-Forwarded-For`.
