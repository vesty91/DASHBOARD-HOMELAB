# Restor_Pc production on Windows Docker Desktop

## Target

- Public URL: `https://dashboard.restor-pc.fr`
- Host deploy dir (runtime secrets / ops): `D:\Docker\RestorPC\dashboard\`
- Source of truth for images/compose: this git repository
- Reverse proxy: existing `restorpc-gateway` (Caddy) — **not** `compose.proxy.yaml`

## Why loopback :3100 / :3102

- Host `:3000` is reserved for local `next dev`.
- All other RestorPC apps publish on `127.0.0.1` and are reached via `host.docker.internal` from the gateway.
- Realtime must be reachable from the gateway for WebSocket upgrades (`/api/realtime/ws`).

## First boot (from the repo)

```powershell
# 1. Secrets (never commit)
New-Item -ItemType Directory -Force D:\Docker\RestorPC\dashboard | Out-Null
Copy-Item .env.production.example D:\Docker\RestorPC\dashboard\.env
# Fill AUTH_SECRET, SECRET_ENCRYPTION_KEY, POSTGRES_PASSWORD in that file.

# 2. Build + start
docker compose -p restorpc-dashboard --env-file D:\Docker\RestorPC\dashboard\.env -f compose.yaml up -d --build

# 3. Gateway: append deploy/restor-pc/gateway-dashboard.caddy into
#    D:\Docker\RestorPC\gateway\Caddyfile then:
docker exec restorpc-gateway caddy reload --config /etc/caddy/Caddyfile
```

## DNS

Create at your DNS provider:

| Type | Name        | Value                        |
| ---- | ----------- | ---------------------------- |
| A    | `dashboard` | public IPv4 of this PC / WAN |
| AAAA | `dashboard` | optional IPv6                |

Verify: `nslookup dashboard.restor-pc.fr`

Caddy (restorpc-gateway) issues ACME certificates automatically once DNS points here and ports 80/443 are reachable.

## Checks

```powershell
docker compose -p restorpc-dashboard --env-file D:\Docker\RestorPC\dashboard\.env ps
curl.exe -fsS http://127.0.0.1:3100/health/live
curl.exe -fsS http://127.0.0.1:3100/health/ready
curl.exe -fsSI https://dashboard.restor-pc.fr/health/live
```

Do not expose Postgres/Redis. Do not edit `D:\Docker\RestorPC\portainer\compose.yaml`.
