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
  permissions/
  secrets/
  monitoring/
  app-library/
  apps/
  ui/
  shared/

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
