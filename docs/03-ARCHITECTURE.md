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
  permissions/
  secrets/
  monitoring/
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

- client Docker ;
- proxy policy ;
- DTO ;
- actions.

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
`scripts/check-architecture-boundaries.mjs`. Le contrôle est intégré à `pnpm lint`. Cette approche
légère et ses limites sont documentées dans
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
