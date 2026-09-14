# ADR 0020 — Proxmox VE API policy

## Statut

Accepté pour la Phase 18 (Proxmox).

## Contexte

Proxmox VE expose une API JSON officielle. Les mutations (start/stop/reboot/snapshot/migration)
sont hors scope. Un proxy générique ou un token dans l'URL est interdit.

Officiel : https://pve.proxmox.com/pve-docs/api-viewer/

## Décisions

### 1. Package `@dashboard/proxmox`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist GET uniquement

Uniquement :

- `GET /api2/json/version`
- `GET /api2/json/cluster/status`
- `GET /api2/json/cluster/resources`

`maxRetries: 0`, `maxRedirects: 0`. Corps borné (256 KiB / 512 KiB ressources).
Un corps tronqué est `INVALID_RESPONSE`. Aucun paramètre de query.

Interdit : nodes/{node}/qemu/{vmid}/status/*, snapshot, migrate, storage content,
ticket login, extjs, proxy générique.

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
