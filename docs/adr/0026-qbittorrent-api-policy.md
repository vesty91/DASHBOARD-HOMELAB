# ADR 0026 — qBittorrent API policy

## Statut

Accepté pour la Phase 18.7 (qBittorrent).

## Contexte

qBittorrent expose l'API officielle WebUI **v2**. L'authentification n'est pas
une clé API : un `POST /api/v2/auth/login` en
`application/x-www-form-urlencoded` renvoie le texte `Ok.` et un cookie
`SID` éphémère. Les mutations torrent, les noms, hashs, magnets et chemins
sont hors scope.

Officiel : https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-4.1)

## Décisions

### 1. Package `@dashboard/qbittorrent`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine http(s)
uniquement (pas de chemin, credentials, query ou fragment).

### 2. Allowlist

Uniquement :

- `POST /api/v2/auth/login` (corps `username`/`password` via `URLSearchParams`,
  jamais en query)
- `POST /api/v2/auth/logout` (cookie requis, aucun query)
- `GET /api/v2/app/version` (texte brut, 64 caractères, secrets redactés)
- `GET /api/v2/transfer/info` (vitesses uniquement)
- `GET /api/v2/torrents/info` (compteurs d'état uniquement, cap 2000)

Aucun paramètre de query. `maxRetries: 0`, `maxRedirects: 0`.

Interdit : GET login, `apikey`/`password`/`sid` en query, POST hors login/logout,
iframe, proxy générique.

### 3. Cookie de session éphémère

Le cookie `SID` (ASCII visible 1–256) n'existe qu'en mémoire pendant le fetch.
Jamais persisté en DB, cache overview, DTO, logs ou navigateur.
`SecureHttpResult` peut exposer `setCookie` au transport serveur uniquement ;
les valeurs ne sont jamais journalisées.

Secrets requis : `username` (1–128) et `password` (1–512), ASCII visible.

Un 401/403 sur login échoue l'overview (`UNAUTHORIZED`).

### 4. DTO borné

Jamais de JSON qBittorrent brut.

- `app/version` : texte `version` (64).
- `transfer/info` : `downloadSpeedBps`, `uploadSpeedBps`, `connectionStatus`
  optionnel (`connected` \| `firewalled` \| `disconnected`).
- `torrents/info` : compteurs
  `{ downloading, uploading, stalled, queued, paused, other }`. Jamais `name`,
  `hash`, magnet, `save_path`, tracker, fichiers, commentaire.

### 5. Permissions

`qbittorrent.read` en conjonction de `integration.use|manage`. ADMIN par défaut
ne l'obtient pas. SYSTEM_ADMIN via le catalogue `PERMISSIONS`. Widget
`qbittorrent-transfer` : `publicSafe=false`. Capability : `status.read`.

### 6. Cache

8 s si complet, 5 s si partiel, failures 15 s. Coalescer + fence. Refresh 10/min.
Le SID n'entre jamais dans la clé ni le payload de cache.
