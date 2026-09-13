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
worker et realtime restent ready et signalent `down`.

### 2. SSE comme premier transport realtime

Le processus `apps/realtime` expose `GET /events` (SSE). WebSocket reste hors
de cette première tranche. Authentification par ticket HMAC court, émis par
l'API après session, jamais par le navigateur vers Redis.

### 3. Worker heartbeat

`apps/worker` exécute un job `heartbeat` borné et publie `job.heartbeat`.
Pas de fake data. La table `jobs` persistée arrivera dans une tranche suivante
de la Phase 13 ; le heartbeat in-process est observable via le bus et `/health`.

### 4. Filtrage serveur

Le bus n'émet pas encore `board.updated` / statuts d'intégration vers les
clients. Seuls les événements d'infrastructure bornés (`job.heartbeat`,
`job.failed`) transitent, pour éviter une fuite RBAC avant le filtrage par
permission.

### 5. Package `@dashboard/events`

Types Zod, bus mémoire, adaptateur Redis injectable, tickets, sondes de
runtime. Ni Next, ni DB, ni widgets.
