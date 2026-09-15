# 10 — Déploiement production

## 1. Cible

Docker Compose. PostgreSQL est obligatoire en production. Redis est requis
pour worker et realtime dans cette stack. Redis n'est pas une source de
vérité métier et n'est pas persisté.

Images : Dockerfile unique, targets `web`, `worker`, `realtime`, `migrate`.
Utilisateur runtime `dashboard` (uid 10001). Node 24 bookworm-slim.
pnpm 11.23.0.

Architectures visées : `linux/amd64` et `linux/arm64` (Buildx, GHCR).
Les tags `phase-*` ne publient pas `latest`. Seuls les tags semver `vX.Y.Z`
publient les images.

La version applicative est `1.1.0` (Phase 21 minor). Les tags `phase-*` ne publient
pas `latest`. Seuls les tags semver stables `vX.Y.Z` publient `latest` /
`X.Y` / `X`. Un prerelease `vX.Y.Z-rc.N` publie uniquement `:tag` et
`:sha-*` (ADR 0029).

## 2. Prérequis

1. Docker Engine + Compose v2.
2. 2 Go RAM minimum pour la stack.
3. Un reverse proxy HTTPS (Caddy recommandé) si exposition hors loopback.
4. Secrets générés localement, jamais commités.

## 3. Fichiers

| Fichier                        | Rôle                                           |
| ------------------------------ | ---------------------------------------------- |
| `compose.yaml`                 | Stack production                               |
| `compose.proxy.yaml`           | Overlay Caddy optionnel (`--profile proxy`)    |
| `compose.proxy.smoke.yaml`     | Monte les certificats TLS du smoke HTTPS       |
| `deploy/Caddyfile`             | Exemple HTTPS + WebSocket/SSE (ACME)           |
| `deploy/Caddyfile.https-smoke` | Variante smoke : même proxy, TLS fichier local |
| `.env.production.example`      | Variables Compose sans secrets réels           |
| `Dockerfile`                   | Images multi-stage                             |
| `docker-bake.hcl`              | Build local / CI                               |

## 4. Premier démarrage

```bash
cp .env.production.example .env
# remplir APP_URL, AUTH_SECRET, SECRET_ENCRYPTION_KEY, POSTGRES_PASSWORD
docker compose -f compose.yaml config
docker compose -f compose.yaml up --build
```

Ordre réel :

1. `postgres` healthy (`pg_isready`)
2. `migrate` exécute Drizzle une seule fois puis exit 0 (`restart: "no"`)
3. `web` / `worker` démarrent seulement après `service_completed_successfully`
4. `redis` healthy puis `worker` / `realtime`

Ne pas utiliser `docker compose up --wait` tant que `migrate` est un oneshot :
Compose attendrait un service qui a déjà quitté.

`APP_URL` doit être l'origine publique exacte (schéma + hôte + port). Elle
contrôle Origin, `serverActions.allowedOrigins`, le callback OIDC et
realtime. Une mauvaise valeur doit échouer clairement.

Onboarding (AC-001 / AC-002) : instance vierge → `/setup` → premier admin →
l'URL d'onboarding refuse une nouvelle création.

## 5. Services et réseau

| Service  | Ports publiés    | Notes                         |
| -------- | ---------------- | ----------------------------- |
| postgres | aucun            | Volume `postgres-data`        |
| redis    | aucun            | `--save ""`, pas d'AOF        |
| migrate  | aucun            | Oneshot, pas de restart-loop  |
| web      | `127.0.0.1:3000` | Reverse proxy sur l'hôte      |
| worker   | aucun            | Health interne `:3001`        |
| realtime | aucun            | Atteint via rewrite/proxy web |

Réseau Compose `internal`. Pas de `/var/run/docker.sock` dans le dashboard.
L'intégration Docker continue d'utiliser un socket proxy HTTP(S) externe.

## 6. Volumes et backup disque

| Volume          | Chemin container      | Contenu                           |
| --------------- | --------------------- | --------------------------------- |
| `postgres-data` | `/var/lib/postgresql` | Source de vérité (PostgreSQL 18+) |
| `appdata`       | `/appdata`            | `BACKUP_DIR=/appdata/backups`     |

Le restore Phase 14 écrit un backup pré-restore **avant** mutation :

- défaut code : `appdata/backups` relatif au cwd du process web
- production Compose : `/appdata/backups` dans le volume `appdata`
- override : variable `BACKUP_DIR`

Fichiers : `pre-restore-<timestamp>-<id>.json`. Pas de rotation automatique
dans cette phase. Ownership uid 10001. Ne pas changer le format backup.

## 7. Variables

Obligatoires en production runtime (`assertRuntimeProductionEnv`) :

- `APP_URL`
- `AUTH_SECRET` (≥ 32 caractères)
- `DATABASE_URL` (`postgres://` ou `postgresql://`)
- `DB_DRIVER=postgres`
- `SECRET_ENCRYPTION_KEY` (base64 de 32 octets)

Optionnelles :

- `REDIS_URL` — fan-out ; **n'entre pas dans web `/health/ready`**
- `WORKER_URL` / `REALTIME_URL`
- `BACKUP_DIR`
- `APP_VERSION` (identifiant sûr dans `/health/*`)
- `LOG_LEVEL`
- `AUTH_SESSION_MAX_AGE_SECONDS`
- `INTEGRATION_DEFAULT_TIMEOUT_MS`

OIDC se configure dans l'UI admin après onboarding. Aucun client secret OIDC
n'est requis tant qu'OIDC est désactivé.

Compose :

- `POSTGRES_USER` / `POSTGRES_DB` / `POSTGRES_PASSWORD` (password obligatoire,
  jamais hardcodé)
- `WEB_PORT`
- `DASHBOARD_IMAGE_PREFIX` (ex. `ghcr.io/vesty91/dashboard-homelab`)

`DATABASE_URL` est interpolé. Un mot de passe contenant `@ : / #` doit être
URL-encodé.

`NEXTAUTH_URL` est aligné sur `APP_URL`.

## 8. Health

| Endpoint            | Contrat                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `GET /health/live`  | Process vivant. HTTP 200 même si Jellyfin/Immich/Synology/Docker/Prometheus/Beszel/Kuma sont down (AC-021). |
| `GET /health/ready` | Web : `SELECT 1` borné sur PostgreSQL. Redis et intégrations **exclus**. DB down → 503.                     |

DTO : `{ status, version }`. Jamais `DATABASE_URL`, `REDIS_URL`, credentials,
hostname interne, stack, config OIDC.

Worker : `/health/live` process ; `/health/ready` échoue si le heartbeat Redis
ne peut pas publier. Realtime : live process ; ready sonde Redis si configuré.

Si `migrate` échoue, web n'est pas ready : Compose ne démarre pas web.

## 9. Reverse proxy (AC-025)

Exemple Caddy : `deploy/Caddyfile`. Overlay :

```bash
docker compose -f compose.yaml -f compose.proxy.yaml --profile proxy up
```

`CADDYFILE` (défaut `./deploy/Caddyfile`) permet au smoke CI de monter
`deploy/Caddyfile.https-smoke` sans changer le service proxy.

Exigences :

- TLS terminé sur le proxy
- `APP_URL=https://<hôte-public>`
- WebSocket : `Connection: Upgrade` + `Upgrade: websocket` vers
  `/api/realtime/ws`. Caddy réécrit vers realtime `/ws`
  (`uri strip_prefix /api/realtime`). Le rewrite Next.js standalone ne
  termine pas l’Upgrade ; le proxy Caddy est le chemin production.
- SSE : `/api/realtime/events` (proxy applicatif, `flush_interval -1`)
- body limit suffisante pour un export backup

Nginx minimal :

```nginx
map $http_upgrade $connection_upgrade {
  default upgrade;
  '' close;
}
server {
  listen 443 ssl;
  server_name dashboard.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
  }
}
```

`X-Forwarded-For` n'est **pas** utilisé pour l'IP d'audit (ADR 0003) : valeur
volontairement nulle. Ne pas réintroduire une confiance aveugle.

## 10. Upgrade

1. Export backup UI (`backup.manage`) + copie volume `appdata` / dump Postgres.
2. Lire `CHANGELOG.md`. Migrations `0000`–`0006` sont immuables.
   Phase 22 ajoute `0007` (schema 7). L'upgrade 1.1.0 → schéma 7 conserve
   users / boards / widgets / integrations.
3. `docker compose pull` (ou rebuild) des **quatre** images même tag.
4. `docker compose up` : `migrate` applique le journal Drizzle une fois.
5. Vérifier `GET /health/ready` = 200, onboarding/login, un board existant.
6. Rollback si nécessaire.

Un backup schema v5 est encore accepté (upgrade in-memory vers v6 puis v7).
v6 accepté (upgrade in-memory vers v7). v7 accepté. v8+ rejeté. `appVersion`
0.1.0 dans une archive v5/v6/v7 reste valide.

## 11. Rollback

Deux opérations distinctes :

- **Rollback image** : redéployer le tag précédent. Possible tant que le
  schéma DB n'a pas avancé, ou si le nouveau code reste compatible.
- **Rollback DB** : **aucune migration descendante n'est supportée**.
  Restaurer le dump PostgreSQL / l'archive pré-upgrade, puis relancer
  l'image correspondant à ce schéma.

Ne pas prétendre qu'un `migrate down` existe.

## 12. Backup / restore (Phase 14 réel)

Format : JSON `homelab-dashboard-backup`, `formatVersion` 1,
`schemaVersion` 5, 6 ou 7, hash SHA-256. Secrets : ciphertext / iv / authTag /
keyVersion uniquement.

Pipeline : export → manifeste + hashes → `validate`/`preview` sans mutation →
backup pré-restore sur disque → restore transactionnel → commit.

`restore` exige `confirm: true`. Échec = rollback SQL. `audit_logs`,
`auth_sessions`, `automation_runs` et `automation_runtime_state` ne sont pas
dans l'archive. Un restore purge ces deux tables d'automation éphémères.

## 13. Logs et shutdown

Stdout/stderr JSON. Champs startup : `service`, `version`, `environment`,
`port`. Jamais `DATABASE_URL`, `REDIS_URL`, `AUTH_SECRET`, secrets OIDC, API keys.

SIGTERM/SIGINT : web (PID 1 = `node apps/web/server.js`), worker et realtime
ferment d'abord l'écoute, puis Redis/DB, timeout 10–15 s. Pas de wrapper
qui avale les signaux.

## 14. Sécurité container

- non-root uid 10001
- `cap_drop: ALL` sur web/worker/realtime/migrate
- Redis : filesystem writable (l'image officielle fait `chown` au démarrage)
- `read_only` + tmpfs `/tmp` (et cache Next)
- pas de `privileged`
- postgres/redis non publiés sur `0.0.0.0`
- aucun secret baked (pas de `.env` réel, pas de `AUTH_SECRET` dans l'image)
- CSP Phase 16 conservée, pas de `unsafe-eval`

## 15. Smoke local

```bash
pnpm test:production
```

Vérifie `compose config`, build, migrate, live/ready, onboarding HTTP,
non-root, absence de docker.sock, DB down → live 200 / ready 503, puis
récupération.

Le test reverse-proxy HTTPS CI : `pnpm test:production:https`.

Il démarre la stack documentée (`compose.yaml` + `compose.proxy.yaml`
`--profile proxy`) avec `deploy/Caddyfile.https-smoke` : même
`reverse_proxy` que `deploy/Caddyfile` (web + WebSocket realtime),
certificats **locaux** openssl (SAN IP). Aucun ACME public. Le client de
smoke charge `cert.pem` et vérifie TLS (`rejectUnauthorized: true`).
L’application ne désactive jamais la vérification TLS.

Couverture : HTTPS, redirection HTTP→HTTPS vers `APP_URL`, `/health/live`
et `/health/ready` derrière le proxy, headers (CSP, HSTS, nosniff),
cookies session/`__Secure-` (HttpOnly / SameSite=Lax / Secure), rewrite
WebSocket `/api/realtime/ws`, SSE `/api/realtime/events`, Origin invalide
(tRPC + WebSocket), DB down → live 200 / ready 503.

`SKIP_BUILD=1` réutilise les images déjà chargées (bake CI ou GHCR).
Le smoke de release GHCR devra utiliser les tags publiés, pas un
`docker build` local.

```bash
pnpm test:production:https
```

## 16. Docker socket proxy

Inchangé (Phase 8) : le dashboard n'a jamais le socket. Voir section historique
ci-dessous pour le proxy restreint.

## 17. Synology / resource limits

Images `linux/amd64` et `linux/arm64`. Dossier hôte conseillé
`/volume1/docker/<project>/` — jamais hardcodé dans le produit.

Aucune limite mémoire universelle. Surveiller postgres en premier.

## 18. Docker socket proxy (détail Phase 8)

Architecture :

```text
apps/web  --HTTP(S)-->  socket-proxy  --ro-->  /var/run/docker.sock
```

Le service web ne monte jamais le socket. Le proxy reste sur le réseau Docker interne.
Aucun `ports:` vers l'hôte (ne pas publier 2375). `docker.sock` est monté read-only
**uniquement dans le proxy**.

Un proxy HTTPS signé par une CA privée homelab utilise `verifyTls=true` et le champ
`trustedCaPem` (certificat CA public uniquement). Ne pas désactiver la vérification TLS
et ne jamais coller une clé privée. Le dashboard conserve la validation hostname.

`CONTAINERS=1` + `POST=0` ne suffit pas. Un proxy durci doit contrôler les sous-routes GET
sensibles. LinuxServer socket-proxy a ajouté le 18 août 2026 :
`ALLOW_ARCHIVE`, `ALLOW_CHANGES`, `ALLOW_EXPORT`, `ALLOW_LOGS`, `ALLOW_TOP`.
Sans ces contrôles (ou équivalent), archive/export/top/logs/changes peuvent rester ouverts.
CVE-2026-78122 documente cette classe de faille.

Ne pas utiliser `:latest` en production. Pin une version ou un digest vérifié. Tant que le
pin n'est pas établi dans ce dépôt, l'exemple utilise `<PINNED_VERIFIED_VERSION>`.

Exemple conceptuel (pas un compose de production copié-collé) :

```yaml
services:
  socket-proxy:
    image: lscr.io/linuxserver/socket-proxy:<PINNED_VERIFIED_VERSION>
    environment:
      CONTAINERS: "1"
      POST: "0"
      ALLOW_ARCHIVE: "0"
      ALLOW_CHANGES: "0"
      ALLOW_EXPORT: "0"
      ALLOW_TOP: "0"
      ALLOW_LOGS: "0"
      ALLOW_START: "1"
      ALLOW_STOP: "1"
      ALLOW_RESTARTS: "1"
      EXEC: "0"
      IMAGES: "0"
      INFO: "0"
      NETWORKS: "0"
      VOLUMES: "0"
      BUILD: "0"
    read_only: true
    tmpfs:
      - /run
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    # aucun ports: vers l'hôte
```

`ALLOW_RESTARTS` peut aussi ouvrir `kill` côté proxy. Le dashboard n'appelle jamais `kill` :
son allowlist reste autoritaire. Activer `ALLOW_LOGS` seulement si l'opérateur veut les logs
Docker. URL saisie par l'utilisateur, placeholder documentaire uniquement :
`http://socket-proxy:2375`.

Synology DSM : URL d'origine HTTPS (port 5001 par défaut), compte DSM en configuration,
mot de passe dans `integration_secrets`, CA privée optionnelle via `trustedCaPem`. Ne pas
exposer DSM sur Internet sans reverse proxy et compte de service dédié. Un NAS en 2FA
s'enrôle comme appareil de confiance depuis la page d'édition.
