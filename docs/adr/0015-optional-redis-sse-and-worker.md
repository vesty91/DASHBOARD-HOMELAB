# ADR 0015 — Redis optionnel, SSE et worker

## Statut

Accepté pour la Phase 13 (fondations).

## Contexte

La vision exige un mode simple `web + sqlite` sans Redis, et un mode avancé
`web + worker + realtime + postgres + redis`. Redis ne doit jamais devenir
source de vérité. Les événements métier listés dans `docs/03-ARCHITECTURE.md`
doivent pouvoir fan-out sans exposer de secret.

## Décisions

### 1. Redis optionnel

`REDIS_URL` (`redis:` / `rediss:`) active le pub/sub distribué. Absent : bus
mémoire in-process. Un Redis indisponible ne fait pas tomber `apps/web` ;
`runtime.status` signale `redis: down`. Worker et realtime lisent `REDIS_URL`
dans `src/main.ts` et construisent `RedisEventBus` via `createConfiguredEventBus`.

### 2. SSE comme premier transport realtime

Le processus `apps/realtime` expose `GET /events` (SSE). WebSocket reste hors
de cette première tranche. Authentification par ticket HMAC court, émis par
l'API après session, jamais par le navigateur vers Redis.

### 3. Worker heartbeat

`apps/worker` exécute un job `heartbeat` borné et publie `job.heartbeat`.
Pas de fake data. La table `jobs` persistée arrivera dans une tranche suivante
de la Phase 13 ; le heartbeat in-process est observable via le bus et `/health`.
Un échec de publish rend `/health/ready` en 503 (`lastErrorCode`). La table `jobs`
persiste les heartbeats (SQLite + PostgreSQL, migration `0005`).

### 4. Filtrage serveur

Les événements `board.updated` / `board.deleted` / `integration.updated` /
`integration.deleted` / `integration.status.changed` / `integration.data.changed` /
`job.*` ne sont envoyés à une connexion que si le ticket HMAC contient le scope
correspondant.
`canReceiveEvent` est default-deny. Redis et le bus mémoire appliquent le même
filtre. Un board public n'ouvre pas le stream. `runtime` exige `settings.read`.

### 5. Package `@dashboard/events`

Types Zod, bus mémoire, adaptateur Redis injectable, tickets, sondes de
runtime. Ni Next, ni DB, ni widgets. La santé Redis utilise un `PING` protocole
(AUTH/TLS), pas un simple connect TCP. Worker et realtime écoutent
`WORKER_HOST`/`WORKER_PORT` (défaut `0.0.0.0:3001`) et
`REALTIME_HOST`/`REALTIME_PORT` (défaut `0.0.0.0:3002`) via `src/main.ts`.
Les tests conservent `127.0.0.1` et un port éphémère.
