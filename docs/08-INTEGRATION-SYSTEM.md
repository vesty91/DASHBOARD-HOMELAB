# 08 — Système d'intégrations

## 1. Définition

Pseudo-type :

```ts
type IntegrationDefinition<TConfig, TSecrets> = {
  id: string;
  displayName: string;
  version: number;
  configSchema: ZodSchema<TConfig>;
  secretSchema: ZodSchema<TSecrets>;
  capabilities: string[];
  createClient(ctx): IntegrationClient;
  testConnection(ctx): Promise<ConnectionResult>;
};
```

## 2. Config vs secrets

Config non sensible :

- baseUrl ;
- verifyTls ;
- timeout ;
- paramètres de comportement.

Secrets :

- apiKey ;
- token ;
- username/password si nécessaire ;
- clientSecret.

Les secrets d'une définition ne peuvent pas figurer dans `configFields` ni être persistés dans `configJson`.

Ne jamais mélanger les deux en DB.

## 3. Test de connexion

Retour normalisé :

```ts
type ConnectionResult =
  | { ok: true; latencyMs: number; metadata?: SafeMetadata }
  | { ok: false; code: IntegrationErrorCode; message: string };
```

## 4. Error codes

```text
UNAUTHORIZED
FORBIDDEN
TIMEOUT
DNS_ERROR
TLS_ERROR
UNREACHABLE
INVALID_RESPONSE
RATE_LIMITED
UNSUPPORTED_VERSION
MISCONFIGURED
NOT_FOUND
UNKNOWN
```

## 5. Base client

Fonctions communes :

- URL normalization ;
- timeout global avec deadline absolue (DNS, connect, TLS, headers, body) ;
- headers ;
- user-agent ;
- max body ;
- JSON parsing ;
- redaction par nom de clé et par valeur de secret connue ;
- TLS policy ;
- retries limités.

## 6. Retries

Retry seulement erreurs transitoires :

- timeout ;
- 429 selon Retry-After ;
- 502/503/504.

Pas de retry automatique :

- 401 ;
- 403 ;
- invalid config.

## 7. SSRF

Politique à implémenter.

Par défaut, une intégration admin peut cibler le LAN, puisque c'est un produit homelab.

Mais bloquer systématiquement :

- `file://` ;
- protocoles non HTTP(S), sauf adapter spécialisé ;
- loopback, link-local, multicast ;
- metadata cloud connues, y compris `169.254.169.254`, `100.100.100.200` (Alibaba) et `fd00:ec2::254` (AWS IMDS IPv6), ainsi que leurs formes IPv4-mapped ;
- redirections vers protocoles interdits.

Le CGNAT `100.64/10` et l'ULA IPv6 restent autorisés, sauf ces endpoints metadata explicitement interdits.

Documenter le risque d'un utilisateur ayant `integration.manage`.

## 8. TLS

Options :

- verify système par défaut ;
- certificat custom de confiance (`trustedCaPem`, certificat CA public uniquement) ;
- mode insecure uniquement si explicitement activé par admin avec warning.

Un certificat CA public n'est pas traité comme un secret. Les clés privées ne sont jamais
acceptées. `trustedCaPem` est stocké dans `integrations.configJson`, pas dans
`integration_secrets`. La validation de chaîne, d'expiration et de hostname reste active.
`trustedCaPem` est incompatible avec `verifyTls=false`. Le trust custom est local à la
requête : jamais `NODE_TLS_REJECT_UNAUTHORIZED`, jamais `https.globalAgent`.

Ne jamais désactiver TLS globalement.

## 9. Capabilities

Exemples :

### Docker

```text
containers.read
containers.stats
containers.logs
containers.start
containers.stop
containers.restart
```

### Jellyfin

```text
server.read
sessions.read
streams.read
```

### Immich

```text
server.read
stats.read
storage.read
```

### Synology

```text
system.read
storage.read
disks.read
```

## 10. Permissions

Le widget demande une capability.

Le serveur vérifie :

1. permission utilisateur sur intégration ;
2. capability disponible ;
3. config valide.

## 11. Version API

Chaque adapter doit tolérer :

- champs absents ;
- versions différentes ;
- erreurs inattendues.

Réponses externes toujours validées/normalisées.

# État Phase 7

Le package `@dashboard/integrations` implémente `IntegrationDefinition`, `IntegrationRegistry`,
capabilities, client HTTP sécurisé, cache mémoire, rate limiter de test et `IntegrationService`.
Le registry générique `createProductionIntegrationRegistry()` reste vide et gelé. Les secrets sont
chiffrés par `@dashboard/secrets`. Le test de connexion bypasse le cache, snapshot `configRevision`,
et ignore un résultat stale. Voir ADR 0007.

## 12. Intégration Docker

Statut : COMPLETE / merged (PR #10), tag `phase-8-complete`.

Premier adapter de production. Composé dans `apps/web` (`createApplicationIntegrationRegistry`),
jamais importé par `@dashboard/integrations`. Voir ADR 0008.

Transport Phase 8 :

- HTTP(S) vers un Docker Socket Proxy restreint.

Différé :

- Unix socket direct ;
- Docker TCP/TLS client-cert ;
- Docker SSH.

Capabilities implémentées :

```text
containers.read
containers.stats
containers.logs
containers.start
containers.stop
containers.restart
```

`docker.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Docker
(`integration.use|manage` + `docker.read|manage`). `integration.read` n'est pas requis pour
ouvrir `/integrations/[id]` d'une intégration Docker. La projection n'inclut pas `baseUrl`,
`config`, `trustedCaPem`, secrets ni `configRevision`.

Pas d'inventaire `GET /images/json`. Pas de generic invoke. Pas de widget Docker dans cette phase.

## 13. Synology

Statut : COMPLETE / merged (PR #11), tag `phase-9-complete`.

Adapter `synology` composé dans `apps/web`. Transport HTTP(S) vers l'origine DSM.
Login POST hors URL. Allowlist CGI `entry.cgi` uniquement. Voir ADR 0009.

Capabilities :

```text
system.read
resources.read
storage.read
```

`synology.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Synology
(`integration.use|manage` + `synology.read`). `integration.read` n'est pas requis.
La projection n'inclut pas `baseUrl`, `config`, `trustedCaPem`, secrets ni `configRevision`.
`integration.list` / `integration.get` omettent aussi `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `synology` pour tout acteur sans `integration.manage`.

2FA : OTP transitoire + `deviceId` server-managed. Pas d'action destructive. Pas de widget
Synology. Refresh manuel 10/min. Cache overview 15 s (5 s si partiel).

## 14. Jellyfin

Statut sur la branche `phase-10-jellyfin` : IMPLEMENTED / REVIEW.

Adapter `jellyfin` composé dans `apps/web`. Transport HTTP(S) vers l'origine Jellyfin.
Auth `X-Emby-Token` uniquement. Allowlist `GET /System/Info` et `GET /Sessions`. Voir ADR 0010.

Capabilities :

```text
server.read
sessions.read
streams.read
```

`jellyfin.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Jellyfin
(`integration.use|manage` + `jellyfin.read`). `integration.read` n'est pas requis.
`integration.list` / `integration.get` omettent `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `jellyfin` sans `integration.manage`.

Widget `jellyfin-sessions` : `publicSafe=false`. Refresh manuel 10/min. Cache overview 8 s
(5 s si partiel). Aucune fake data. Pas de SDK officiel.

## 15. Immich

Statut sur la branche `phase-11-immich` : IMPLEMENTED / REVIEW.

Adapter `immich` composé dans `apps/web`. Transport HTTP(S) vers l'origine Immich.
Auth `x-api-key` uniquement. Allowlist GET `/api/server/ping`, `/api/server/version`,
`/api/server/about`, `/api/server/storage`, `/api/server/statistics`. Voir ADR 0011.

`immich.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Immich
(`integration.use|manage` + `immich.read`). `integration.read` n'est pas requis.
`integration.list` / `integration.get` omettent `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `immich` sans `integration.manage`.

Widget `immich-stats` : `publicSafe=false`. Refresh manuel 10/min. Cache overview 15 s
(8 s si partiel). Aucune fake data. Pas d'EXIF, chemins, thumbnails ni `usageByUser`.

## 16. Beszel

Statut sur la branche `phase-12-beszel` : IMPLEMENTED / REVIEW.

Adapter `beszel` composé dans `apps/web`. Transport HTTP(S) vers l'origine Beszel.
Auth PocketBase `POST /api/collections/users/auth-with-password`. Lecture paginée
`GET /api/collections/systems/records`. Voir ADR 0012.

`beszel.integration.get` expose uniquement `{ id, name, enabled }` aux lecteurs Beszel
(`integration.use|manage` + `beszel.read`). `integration.read` n'est pas requis.
`integration.list` / `integration.get` omettent `baseUrl`, `config`, `capabilities` et
l'état des secrets d'un record `beszel` sans `integration.manage`.

Widget `beszel-hosts` : `publicSafe=false`. Refresh manuel 10/min. Cache overview 15 s
(8 s si partiel). Token jamais persisté. Aucune mutation. Aucune fake data.

## 17. Prometheus

Autoriser un sous-ensemble de requêtes par widget ou permission.

Limiter :

- range ;
- step ;
- volume de séries ;
- timeout.

## 18. Tests intégrations

Pour chaque adapter :

- auth success ;
- auth failure ;
- timeout ;
- invalid JSON ;
- partial response ;
- version unsupported ;
- permission.
