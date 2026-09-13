# ADR 0010 — Jellyfin API policy

## Statut

Accepté pour la Phase 10.

## Contexte

La Phase 10 ajoute le troisième adapter de production : Jellyfin. L'API officielle expose
`GET /System/Info` et `GET /Sessions`. L'authentification se fait par clé API. Les chemins
locaux, adresses internes et identifiants utilisateurs sont hostiles.

## Décisions

### 1. Package `@dashboard/jellyfin`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations`. Pas de SDK officiel :
HTTP + Zod, comme Synology, pour limiter la surface. Aucune migration DB.

### 2. Auth par header uniquement

La clé API voyage uniquement dans `X-Emby-Token`. Jamais `api_key` en query, jamais dans une
URL persistée. La clé doit être ASCII visible U+0021–U+007E (1–512). Un caractère de contrôle
est rejeté à l'ingress.

### 3. Allowlist

Uniquement `GET /System/Info` et `GET /Sessions` (`activeWithinSeconds` entier 1–3600).
`maxRetries: 0`, `maxRedirects: 0`, TLS vérifié, CA privée optionnelle.

### 4. DTO

Pas de `LocalAddress`, chemins, `UserId`, `DeviceId`, `RemoteEndPoint` ni raw JSON.
`PlayMethod` est canonicalisé en `direct-play` | `direct-stream` | `transcode` ou `null`.
Jamais inventé.

### 5. Cache

Overview 8 s si complet, 5 s si partiel, failures 15 s. Clé SHA-256 de
`configRevision` + secrets chiffrés + génération refresh. Coalescer + fence comme Phase 9.
Refresh 10/min.

### 6. Permissions

`jellyfin.read` conjonction `integration.use|manage`. ADMIN par défaut ne l'obtient pas.
Widget `jellyfin-sessions` : `publicSafe=false`.

## Conséquences

AC-013 est satisfait par le widget board, pas par un polling navigateur vers Jellyfin.
