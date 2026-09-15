# ADR 0020 — Proxmox VE API policy

## Statut

Accepté pour la Phase 18 (Proxmox).

## Contexte

Proxmox VE expose une API JSON officielle. Un proxy générique ou un token dans
l'URL est interdit. Phase 18 : lecture cluster uniquement. Phase 21 : mutations
power allowlistées (start/shutdown/reboot QEMU/LXC) uniquement.

Officiel : https://pve.proxmox.com/pve-docs/api-viewer/

## Décisions

### 1. Package `@dashboard/proxmox`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist HTTP

Phase 18 (lecture) :

- `GET /api2/json/version`
- `GET /api2/json/cluster/status`
- `GET /api2/json/cluster/resources`

Phase 21 (voir amendement) : GET `status/current` + POST `start|shutdown|reboot`.

`maxRetries: 0`, `maxRedirects: 0`. Corps borné (256 KiB / 512 KiB ressources).
Un corps tronqué est `INVALID_RESPONSE`. Aucun paramètre de query.

Interdit : force stop, destroy, snapshot, migrate, storage content, ticket login,
extjs, proxy générique.

### 3. Auth token officielle

Secret `apiToken` au format `USER@REALM!TOKENID=SECRET` (ASCII visible).
Header uniquement : `Authorization: PVEAPIToken=<token>`. Jamais cookie
`PVEAuthCookie`, jamais query string.

### 4. DTO borné

Jamais de JSON Proxmox brut. Pas d'IP de nœud, pas de nom de VM/CT, pas de chemins
de stockage. Compteurs + nœuds (64 max). > 2000 ressources brutes => `INVALID_RESPONSE`.
Secrets redacted.

### 5. Permissions

`proxmox.read` en conjonction de `integration.use|manage`. ADMIN par défaut ne
l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`proxmox-resources` : `publicSafe=false`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.

## Amendement Phase 21

Les mutations VM/CT restent interdites **sauf** l'allowlist suivante, construite
uniquement depuis des champs validés :

- `GET /api2/json/nodes/{node}/{qemu|lxc}/{vmid}/status/current`
- `POST /api2/json/nodes/{node}/{qemu|lxc}/{vmid}/status/start`
- `POST /api2/json/nodes/{node}/{qemu|lxc}/{vmid}/status/shutdown`
- `POST /api2/json/nodes/{node}/{qemu|lxc}/{vmid}/status/reboot`

Permissions : `proxmox.start` / `proxmox.shutdown` / `proxmox.reboot` en
conjonction de `integration.interact|manage`. Pas de force stop, destroy,
snapshot, migrate, clone, console, terminal, ni mise à jour de config.
