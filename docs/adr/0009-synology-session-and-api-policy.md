# ADR 0009 — Synology session and API policy

## Statut

Accepté pour la Phase 9.

## Contexte

La Phase 9 ajoute le second adapter de production : Synology DSM. Le NAS expose une API web
sessionnelle (`SYNO.API.Auth`) et des APIs Core / DSM.Info / Storage. Les identifiants, le SID,
le SynoToken et le jeton d'appareil de confiance sont des secrets. Une CA privée homelab est
fréquente sur le port 5001. DSM 7 exige souvent un OTP ; un appareil de confiance permet la
lecture sans OTP à chaque requête.

## Décisions

### 1. Package `@dashboard/synology`

Composé dans `apps/web` (`createApplicationIntegrationRegistry`), jamais importé par
`@dashboard/integrations`. `createProductionIntegrationRegistry()` reste vide. Pas de widget
Synology. Pas de realtime / polling. Pas d'action destructive (reboot, shutdown, FileStation,
User). Aucune migration DB (`0000`–`0004` immuables).

### 2. Auth sessionnelle, credentials hors URL

Bootstrap fixe : `GET /webapi/entry.cgi` `SYNO.API.Info` v1 `query` sur une allowlist d'APIs
(jamais `query=all`). Login / logout en POST `application/x-www-form-urlencoded` vers
`/webapi/entry.cgi` uniquement. `account` / `passwd` / OTP / `_sid` ne sont jamais des query
params. Session nommée `DashboardHomelab`, `format=sid`. Auth v6 : `enable_syno_token=yes`.
Le SID est transmis via `Cookie: id=<sid>` et le header `SynoToken` si présent. Logout dans un
`finally`. Le SID n'est pas mis en cache. Au plus une réauthentification pour les codes session
106 / 107 / 119 ; jamais pour 400 / 401 / 403 / 404.

### 3. 2FA et appareil de confiance

OTP transitoire uniquement via `synology.auth.enrollDevice`. Le DID renvoyé par DSM est stocké
chiffré comme secret `deviceId` server-managed. `synology.auth.clearDevice` n'efface que le
jeton local. SID / SynoToken / OTP / DID ne sont jamais renvoyés au navigateur ni journalisés.

### 4. Transport

Uniquement `secureRequest`, `maxRetries: 0`, `maxRedirects: 0`. Path découvert autre que
`entry.cgi` : section `unavailable` / `INVALID_RESPONSE`, jamais appelé. Corps JSON ~256 KiB
sauf Storage ~2 MiB.

### 5. DTO assainis et vue partielle

Overview global `available | degraded` avec `fetchedAt`. Chaque section
`available | degraded | unavailable` + `reason`. Timeout Storage ne masque pas system / CPU /
RAM. `SYNO.DSM.Info` est la source système principale ; `SYNO.Core.System` est un enrichissement.
S'il est annoncé mais échoue (hors session retryable), la section système est `degraded` avec
les données DSM.Info. Un payload DSM.Info, Storage ou Utilization malformé est `unavailable` /
`invalid-response`, pas une liste vide « available ». Tailles trop grandes pour
`MAX_SAFE_INTEGER` → `null` (pas d'arrondi). RAM DSM.Info en
MB, utilization `total_real` / `avail_real` en KB, DTO en octets. CPU = `user+system+other` ;
somme hors `[0, 100]`, mémoire `avail > total` ou total `<= 0` → `invalid-response`.
Températures hors −20..150 °C → `null`. Jamais de numéro de série.

Cache overview : 15 s si complet, ~5 s si partiel. La clé d'opération est
`synology.overview:<sha256>` calculée depuis `configRevision`, la génération de refresh
et l'état chiffré des secrets (`key`, `ciphertext`, `iv`, `authTag`, `keyVersion`) — jamais
le plaintext. Un fetch déjà en vol peut encore écrire son ancienne génération ; la nouvelle
configuration ne la lit pas. `refreshOverview` avance d'abord une génération de refresh
runtime partagée (`MemorySynologyRefreshFence`), invalide le cache, puis relit avec cette
génération. Une requête commencée avant le refresh ne peut plus écrire la clé active.
Les cache misses d'une même génération sont coalescés par
`MemorySynologyOverviewCoalescer` (runtime partagé, pas de `globalThis` dans le package).

Jamais exposés : mot de passe, SID, synotoken, DID, OTP, numéro de série NAS/disque, `baseUrl`,
`trustedCaPem`, secrets, `configRevision`. `integration.list` / `integration.get` omettent
`baseUrl`, `config`, `capabilities` et l'état des secrets d'un record Synology sans
`integration.manage`. `testConnection` exige `SYNO.DSM.Info` disponible : un login réussi ne
marque pas l'intégration `available`. Un échec optionnel de Core.System — y compris un
objet vide ou sans champ reconnu — dégrade la section système mais ne fait pas échouer
le test si DSM.Info est valide. L'enrollment OTP persiste `deviceId` uniquement via
`upsertSecretIfRevision` (CAS sur `configRevision`) : un changement d'URL, de mot de
passe ou de secret pendant l'attente DSM jette le DID reçu.

### 6. Permissions

Une seule permission Synology : `synology.read`. Lecture = auth active **et**
(`integration.use` ou `integration.manage`) **et** `synology.read`. Enrollment OTP :
`integration.manage` (`canManageAuth`). Le rôle `ADMIN` par défaut n'obtient pas
`synology.read`. La délégation persistante utilise des permissions supplémentaires de groupe
(`GROUP_GRANTS_<groupId>`), modifiables uniquement par `SYSTEM_ADMIN`. Un type d'intégration
incorrect (ex. ID Docker) renvoie `NOT_FOUND` non-oracle, même message que metadata.

### 7. tRPC

`synology.permissions`, `synology.integration.get`, `synology.overview.get`,
`synology.overview.refresh`, `synology.auth.enrollDevice`, `synology.auth.clearDevice`.
Aucun generic invoke (`api` / `method` / `path` client).

## Conséquences

Le compte DSM est de la configuration (`account`), le mot de passe un secret utilisateur, le
jeton d'appareil un secret server-managed. L'UI n'expose pas `deviceId`. Les métriques inconnues
affichent « Indisponible », jamais `0` / `0 %` / `0 °C`.
