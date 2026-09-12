# ADR 0008 — Docker transport and endpoint policy

## Statut

Accepté pour la Phase 8 (branche `phase-8-docker`, IMPLEMENTED / REVIEW).

## Contexte

Le daemon Docker est une surface hautement privilégiée : un accès au socket équivaut souvent à
un contrôle proche de root sur l'hôte. La Phase 8 doit connecter le dashboard à un Engine réel
sans monter `/var/run/docker.sock` dans `apps/web`, sans affaiblir `integrationUrlSchema`
(HTTP/HTTPS uniquement), et sans migration DB.

Le framework Phase 7 fournit déjà `secureRequest` (SSRF, DNS pinning, timeouts, TLS, body bound).
Les proxies historiques qui n'exposent que `CONTAINERS=1` et `POST=0` restent insuffisants :
des sous-routes GET sensibles (`/archive`, `/export`, `/top`, `/logs`, `/changes`) ont encore
été accessibles. LinuxServer socket-proxy a publié un hardening le 18 août 2026
(`ALLOW_ARCHIVE`, `ALLOW_CHANGES`, `ALLOW_EXPORT`, `ALLOW_LOGS`, `ALLOW_TOP`).
CVE-2026-78122 documente le même classe de faille sur d'autres proxies.

## Décisions

### 1. Transport Phase 8 = HTTP(S) vers un Docker Socket Proxy

Le dashboard parle uniquement à la racine HTTP(S) du proxy, par exemple
`http://socket-proxy:2375`. Aucun schéma `unix://`, aucun sentinel `http://unix-socket`,
aucun montage de `docker.sock` dans le conteneur web.

Transports différés :

- Unix socket direct ;
- Docker TCP/TLS avec certificat client ;
- Docker SSH.

### 2. Le proxy est une couche supplémentaire, pas la frontière unique

Le proxy recommandé doit :

- rester sur un réseau Docker interne, sans `ports:` vers l'hôte ;
- monter `docker.sock` en lecture seule **uniquement dans le proxy** ;
- disposer de contrôles granulaires des sous-routes GET ;
- désactiver archive/export/top/changes ;
- n'activer les logs et start/stop/restart que si l'opérateur le veut.

`CONTAINERS=1` + `POST=0` n'est pas une protection suffisante.

Si un contrôle proxy du type `ALLOW_RESTARTS` ouvre aussi `kill`, le dashboard **n'utilise
jamais** `kill`. Notre allowlist reste autoritaire.

Ne pas documenter `:latest` comme exemple production. Utiliser
`<PINNED_VERIFIED_VERSION>` jusqu'à pin explicite d'un digest vérifié.

### 3. Allowlist exacte côté Dashboard

GET :

- `/_ping`
- `/version`
- `/vX.Y/containers/json`
- `/vX.Y/containers/{id}/json`
- `/vX.Y/containers/{id}/stats`
- `/vX.Y/containers/{id}/logs`

POST :

- `/vX.Y/containers/{id}/start`
- `/vX.Y/containers/{id}/stop`
- `/vX.Y/containers/{id}/restart`

Toute autre route est refusée **avant** le transport, y compris archive, export, top,
changes, exec, attach, kill, images, volumes, networks, swarm.

Aucun `docker.request(method, path)` public. Aucun generic invoke tRPC.

### 4. Identifiants et versions

Les endpoints individuels n'acceptent que des container IDs de 64 hex lowercase.
Négociation d'API par tuples `{ major, minor }` entre `1.40` et `1.55`.
`/_ping` et `/version` restent unversioned.

### 5. Secrets, logs et actions

Aucun secret Docker en Phase 8. Les logs contiennent potentiellement des secrets
applicatifs : jamais mis en cache, jamais écrits dans les logs dashboard, chargés
uniquement sur demande avec `docker.logs`. POST sans retry. Rate limit actions séparé.

### 6. Composition, pas de couplage integrations → docker

`packages/integrations` reste générique. `createProductionIntegrationRegistry()` reste vide.
L'application compose Docker dans `apps/web` via `createApplicationIntegrationRegistry()`.

### 7. Hors scope Phase 8

- aucune migration DB (`0000`–`0004` immuables) ;
- aucun widget Docker de board ;
- aucun realtime / follow / stream ;
- aucun inventaire `GET /images/json` ;
- audit persistant des actions Docker différé (aucune table) ;
- Phase 9 Synology : voir ADR 0009.

## Conséquences

- `@dashboard/docker` devient le premier adapter de production ;
- l'UI `/integrations/[id]` et `/integrations/[id]/containers/[containerId]` consomme des DTO sûrs ;
- `/integrations/[id]` d'une intégration Docker s'ouvre via `docker.integration.get`
  (`{ id, name, enabled }`) pour un lecteur délégué, sans `integration.read` ni config ;
- un proxy HTTPS à CA privée utilise `trustedCaPem` (CA publique, pas un secret) avec
  `verifyTls=true` ; hostname et chaîne restent validés ; clés privées et mTLS restent hors scope ;
- le rôle `ADMIN` par défaut ne reçoit pas les permissions `docker.*` ;
- la reconnaissance d'apps réutilise `@dashboard/app-library` sans inventer d'URL.
