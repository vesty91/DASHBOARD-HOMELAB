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

Exemple conceptuel :

```text
web/worker -> socket-proxy -> /var/run/docker.sock
```

N'exposer que les endpoints requis.

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
