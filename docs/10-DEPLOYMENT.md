# 10 — Déploiement

## 1. Cible principale

Docker Compose.

## 2. Compose production cible

```text
web
worker
realtime
postgres
redis
docker-socket-proxy (optionnel)
```

## 3. Volumes

```text
/appdata
postgres-data
redis-data optionnel
```

`/appdata` :

- uploads ;
- trusted certificates ;
- exports temporaires contrôlés ;
- runtime metadata non DB.

## 4. Variables environnement

Exemple :

```env
NODE_ENV=production
APP_URL=https://dashboard.example.com
AUTH_SECRET=
SECRET_ENCRYPTION_KEY=

DB_DRIVER=postgres
DATABASE_URL=postgresql://...

REDIS_URL=redis://redis:6379

LOG_LEVEL=info

TRUSTED_PROXY_COUNT=1
INTEGRATION_DEFAULT_TIMEOUT_MS=8000
```

Jamais de vraie clé dans `.env.example`.

## 5. Reverse proxy

Support :

- Synology Reverse Proxy ;
- Nginx ;
- Nginx Proxy Manager ;
- Traefik ;
- Caddy.

Exigences :

- WebSocket upgrade si realtime ;
- forwarded headers ;
- body limit pour backup ;
- TLS.

## 6. Health endpoints

```text
/health/live
/health/ready
```

### live

Process vivant.

### ready

- DB accessible ;
- migrations OK ;
- dépendances obligatoires prêtes.

Ne pas considérer une intégration utilisateur en panne comme un échec de readiness globale.

## 7. Migrations

Au démarrage :

Option recommandée :

- job de migration explicite avant upgrade.

Éviter plusieurs réplicas lançant une migration concurrente sans verrou.

Commandes Phase 2 :

```bash
pnpm --filter @dashboard/db db:migrate:sqlite
pnpm --filter @dashboard/db db:migrate:postgres
```

`DB_DRIVER` et `DATABASE_URL` sont obligatoires au moment de créer un client DB. SQLite active les
foreign keys à chaque connexion. PostgreSQL utilise un pool borné avec timeout de connexion.

## 8. Upgrade

Procédure :

1. backup ;
2. pull image ;
3. migration ;
4. démarrage ;
5. healthcheck ;
6. rollback documenté.

## 9. Synology

Prévoir images `linux/amd64` et éventuellement `linux/arm64`.

Dossier conseillé :

```text
/volume1/docker/<project>/
```

Ne pas coder de chemin Synology en dur dans le produit.

## 10. Docker socket proxy

Architecture Phase 8 :

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

## 11. Resource limits

Documenter :

- mémoire web ;
- worker ;
- postgres ;
- redis.

Aucune valeur rigide universelle.

## 12. Backup automatique

Phase ultérieure :

- cron ;
- rotation ;
- rétention ;
- destination locale/NAS ;
- test restore périodique.
