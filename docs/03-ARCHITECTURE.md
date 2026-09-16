# 03 — Architecture technique

## 1. Monorepo cible

```text
apps/
  web/
  worker/
  realtime/

packages/
  api/
  auth/
  db/
  boards/
  widgets/
  integrations/
  docker/
  synology/
  jellyfin/
  immich/
  beszel/
  prometheus/
  uptime-kuma/
  proxmox/
  grafana/
  ntfy/
  prowlarr/
  qbittorrent/
  radarr/
  seerr/
  custom-api/
  sonarr/
  permissions/
  secrets/
  monitoring/
  app-library/
  apps/
  ui/
  shared/
  events/
  backup/

tooling/
  eslint/
  typescript/

docs/
scripts/
reference/
```

## 2. Responsabilités

### apps/web

- Next.js ;
- SSR/RSC ;
- pages ;
- routes auth ;
- API/tRPC gateway ;
- UI.

### apps/worker

- polling ;
- healthchecks ;
- tâches programmées ;
- cleanup ;
- consolidation métriques ;
- notifications.

### apps/realtime

- WebSocket/SSE ;
- fanout événements ;
- présence éventuelle ;
- streaming de stats borné.

### packages/api

- routers tRPC ;
- context ;
- middleware auth ;
- contrôle permission ;
- DTO.

### packages/auth

- Auth.js ;
- providers ;
- session ;
- password ;
- OIDC.

### packages/db

- Drizzle ;
- schema ;
- migrations ;
- repositories ;
- transactions.

### packages/boards

- service board ;
- layout ;
- collision/version ;
- duplication/export.

### packages/widgets

- WidgetRegistry ;
- types ;
- définitions ;
- runtime.

### packages/integrations

- IntegrationRegistry ;
- adapters ;
- clients ;
- capabilities ;
- normalisation.

### packages/docker

Responsable :

- client Docker Engine HTTP(S) via `secureRequest` ;
- négociation de version API ;
- policy d'endpoints exacte ;
- DTO sûrs (jamais Env/Labels/Mounts/Command/HostConfig) ;
- logs bornés et sanitizés ;
- actions start/stop/restart ;
- `DockerService` sur `IntegrationStore` / `IntegrationRegistry` / `IntegrationCache`.

Ne dépend pas de `@dashboard/web`, Next, React, Drizzle ni `@dashboard/db`.
`packages/integrations` ne dépend pas de Docker.

### packages/synology

Responsable :

- client DSM HTTP(S) via `secureRequest` ;
- bootstrap `SYNO.API.Info` sur `/webapi/entry.cgi` uniquement ;
- login POST hors URL, SID en cookie de requête, logout en `finally` ;
- 2FA via OTP transitoire et secret `deviceId` server-managed ;
- DTO sûrs (jamais mot de passe, SID, OTP, DID, numéros de série) ;
- overview partiel system / resources / storage ;
- `SynologyService` sur store / registry / cache / `loadIntegrationSecrets`.

Ne dépend pas de `@dashboard/web`, Next, React, Drizzle ni `@dashboard/db`.
`packages/integrations` ne dépend pas de Synology.

### Composition des adapters

Les adapters de production sont composés dans `apps/web`
(`createApplicationIntegrationRegistry`), pas dans le package générique.
`createProductionIntegrationRegistry()` reste vide pour les invariants Phase 7.

### packages/permissions

- RBAC ;
- policies ;
- permission resolver.

### packages/secrets

- encryption ;
- redaction ;
- rotation primitives.

### packages/monitoring

- health checks ;
- status ;
- history ;
- metrics internes.

### packages/app-library

- registre pur de définitions d'applications ;
- catalogue statique, recherche, catégories et cycle de vie ;
- relations `replacedBy` validées au freeze du registry ;
- hints Docker sous forme de strings uniquement, y compris pour les apps legacy ;
- aucune dépendance DB, React, Next.js, API, intégrations ou Docker.

### packages/apps

- contrats et validation App ;
- service CRUD et orchestration du test manuel ;
- dépend de repositories injectés et des primitives réseau de monitoring.

### packages/ui

- design system ;
- shadcn wrappers ;
- composants partagés.

### packages/shared

- types réellement communs ;
- result/error types ;
- utilities sans dépendance infrastructure.

### packages/backup

- contrat d'archive JSON versionné ;
- hashes SHA-256 ;
- validation default-deny ;
- preview sans secret en clair ;
- service export / validate / restore.

Le package ne dépend pas de Next, React, Drizzle ni de `@dashboard/db`.

## 3. Règles de dépendances

Recommandation :

```text
apps -> packages
api -> domain services
domain services -> db/integrations/permissions
integrations -> shared/secrets
db -> shared
ui -> shared
```

Interdits :

```text
db -> web
integrations -> web
shared -> db
shared -> next
```

La Phase 1 vérifie ces quatre interdictions dans les manifests avec
`scripts/check-architecture-boundaries.mjs`. Le contrôle est intégré à `pnpm lint`. La Phase 7 étend
le script : `integrations` n'a pas le droit de dépendre de `web`, `next`, `drizzle-orm`, `db` ni
`@dashboard/docker` ; `secrets` n'a pas le droit de dépendre de `web`, `next`, `drizzle-orm`, `db`
ni `integrations` ; `docker` n'a pas le droit de dépendre de `web`, `next`, `react`, `drizzle-orm`
ni `db`.
Cette approche légère et ses limites sont documentées dans
`docs/adr/0001-lightweight-package-boundary-check.md`.

## 4. API

tRPC comme API interne typée.

REST optionnelle pour :

- health ;
- public API future ;
- webhooks ;
- OpenAPI export futur.

Toutes les routes mutatives doivent :

- valider input ;
- vérifier session ;
- vérifier permission ;
- tracer audit si sensible.

## 5. Événements

Créer un bus logique :

```ts
type DomainEvent =
  | BoardUpdated
  | IntegrationStatusChanged
  | ContainerStatusChanged
  | MonitorStatusChanged
  | JobFailed;
```

Transport :

- in-process en mode simple ;
- Redis Pub/Sub ou Streams en mode distribué.

## 6. Mode simple et mode avancé

### Mode simple

```text
web + sqlite
```

Usage de développement ou petite instance.

### Mode production

```text
web
worker
realtime
postgres
redis
```

## 7. Cache

Cache uniquement pour données dérivées ou externes.

Ne jamais considérer Redis comme source de vérité.

Exemples :

- stats Docker : 2–5 s ;
- statut apps : 15–60 s ;
- Synology info : 10–30 s ;
- Jellyfin sessions : 5–10 s ;
- metadata stable : minutes/heures.

## 8. Concurrence

Les modifications de board doivent intégrer une version optimiste :

```text
board.revision
```

Le client envoie `expectedRevision`.

En cas de conflit :

- 409/erreur typée ;
- reload ;
- stratégie de merge future.

## 9. ADR

Toute décision structurante doit créer :

```text
docs/adr/NNNN-title.md
```

Exemples :

- choix grid engine ;
- Redis obligatoire ou non ;
- protocole realtime ;
- stratégie secrets.

# État Phase 6

`packages/widgets` est le Widget Engine. Le domaine (registry, schémas, policy) est séparé du runtime
React. `packages/boards` reçoit une `BoardWidgetPolicy` injectée ; aucun cycle `boards <-> widgets`.
`apps/web` compose la policy built-in. Voir ADR 0006.

# État Phase 7

`@dashboard/secrets` chiffre AES-256-GCM avec AAD et keyVersion. `@dashboard/integrations` fournit
registry, client HTTP SSRF, cache mémoire borné, rate limiter et `IntegrationService`.
`packages/db` implémente `integration-runtime` sans connaître le plaintext. Le registry de production
est vide. Voir ADR 0007.

# État Phase 13

COMPLETE. `@dashboard/events` fournit le bus mémoire, `createConfiguredEventBus(REDIS_URL)`, les tickets
HMAC scopés, `canReceiveEvent` (default deny) et `runtime.status` (PING Redis).
`apps/web` publie `board.*` / `integration.*` après commit. `apps/realtime` filtre chaque
événement avec les subscriptions du ticket. `integration.data.changed` signale un refresh
overview réussi (id + type, jamais de télémétrie brute) ; le client autorisé debounce puis
refetch le DTO via `router.refresh()`. `GET /api/realtime/events` proxy SSE same-origin.
`GET /ws` ajoute WebSocket avec le même filtre RBAC, ping/pong, plafond global et par
utilisateur, et backpressure (`bufferedAmount`). Le client tente WS puis SSE. Le polling
10 s reste le producteur autonome des widgets live. Redis reste optionnel. Voir ADR 0015.

# État Phase 14

COMPLETE. `@dashboard/backup` valide une archive JSON non fiable (vocabulaire fermé,
secrets uniquement chiffrés, hash SHA-256). `packages/db` dump/replace en transaction
sans table de backup. tRPC `backup.export` / `backup.validate` / `backup.restore`
exige `backup.manage`. Pipeline : export → manifeste + hashes → preview sans mutation →
backup pré-restore → restore transactionnel → commit → invalidation cache. Voir ADR 0016.

# État Phase 15

COMPLETE. OIDC générique via NextAuth (pas de provider codé en dur), identités
`issuer+sub`, mapping de groupes default-deny, journal d'audit, sessions révocables.
Migration `0006` / `schemaVersion` 6. Backup inclut les identités et mappings OIDC
ainsi que le secret OIDC chiffré ; `audit_logs` et `auth_sessions` sont exclus.
Voir ADR 0017.

# État Phase 16

COMPLETE. Headers/CSP enforcement, tRPC POST-only, rate limits des actions
sensibles, contrôle d'origine realtime, cookies session explicites. Voir ADR 0018.

# État Phase 17

COMPLETE. Images production multi-target, Compose postgres/redis/migrate/web/worker/realtime,
health live/ready, GHCR sur tags semver, pas de `0007`. Voir ADR 0019 et `docs/10-DEPLOYMENT.md`.

# État Phase 18

COMPLETE. Neuf adapters lecture seule (Proxmox, Grafana, ntfy, Sonarr, Radarr,
Prowlarr, qBittorrent, Seerr, Custom API) et widgets `publicSafe=false`.
Pas de `0007`. Voir ADR 0020–0028.

# État Phase 19

COMPLETE. Release produit `1.0.0`, semver GHCR, pas de `0007`.
Voir ADR 0029, `CHANGELOG.md` et `docs/19-V1-STABILIZATION.md`.

# État Phase 20

COMPLETE. Hardening post-v1 (a11y, Lighthouse, Actions, HTTPS smoke).
Patch produit `1.0.1`. Schéma 6 / backup `formatVersion` 1 inchangés.
Voir `docs/20-POST-V1-HARDENING.md`.

# État Phase 21

COMPLETE. Actions d'intégration allowlistées (Proxmox, qBittorrent, ntfy,
Sonarr, Radarr, Seerr). Prowlarr / Grafana / Custom API restent lecture seule.
Minor produit `1.1.0`. Voir `docs/21-SAFE-INTEGRATION-ACTIONS.md`.

# État Phase 22

COMPLETE. Persistence automations (`0007`, schema 7). Scheduler worker
at-most-once (leases, `runKey`, pas de retry side-effect). Actions via
`runSafeIntegrationAction` (default-deny). Alerting status-transition +
ntfy avec debounce/cooldown. UI `/automations` (dry-run, manual run,
history). Pas d'eval, pas de proxy HTTP arbitraire.
Minor produit `1.2.0`. Voir `docs/22-AUTOMATIONS.md`.

# État Phase 23

COMPLETE. Notification Center in-app (`0008`, schema 8) : unread / read /
dismiss, badge, realtime user-scoped. Incidents disponibilité
(open / resolve) + timeline. RBAC `notification.*.self` / `incident.read`.
Backup exclut `notifications`, `incidents`, `incident_events`.
Minor produit `1.3.0`. Voir `docs/23-NOTIFICATIONS.md`.

# État Phase 24

COMPLETE. PWA sécurisée (`0009`, schema 9) : manifest, SW sans cache
HTML/API auth, offline shell public. Web Push VAPID opt-in
(`push_subscriptions` chiffrées, tRPC `push.*`, delivery Notification
Center). UX mobile (safe-area, touch targets) — pas de bouton Install
universel. Backup exclut aussi `push_subscriptions`.
Minor produit `1.4.0`. Voir `docs/24-PWA.md`.

# État Phase 25

COMPLETE. Status pages sûres (`0010`, schema 10) : package
`@dashboard/status-pages`, projection publique opt-in (pas d’IDs
d’intégration / URL / secrets), maintenance windows UTC + notifications,
UI admin `/status-pages*` et publique `/status/[slug]` (`noindex`).
Backup **inclut** la config status/maintenance. Minor produit `1.5.0`.
Voir `docs/25-STATUS-PAGES.md`.

# État Phase 26

COMPLETE. Fiabilité / SLO (`0011`–`0012`, DB schema 12) : package
`@dashboard/reliability`, rollups quotidiens dérivés (hors backup), objectifs
`service_slos` (backup schema 11), UI `/reliability`, widget
`reliability-status`. Minor produit `1.6.0`. Voir `docs/26-RELIABILITY.md`.
