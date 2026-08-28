# ADR 0007 — Integration Framework, secret storage and connection testing

## Statut

Accepté pour la Phase 7.

## Contexte

La Phase 7 introduit le framework générique d'intégrations. Les adapters métier (Docker, Synology,
Jellyfin, etc.) commencent à la Phase 8. Le schéma possède déjà `integrations` et
`integration_secrets`. Un test de connexion effectue du réseau hors transaction : un résultat obsolète
ne doit pas écraser une configuration plus récente.

## Décisions

### 1. Registry de production vide

`IntegrationRegistry` enregistre des `IntegrationDefinition` immuables après `register`. Un id dupliqué,
une version < 1, des capabilities invalides ou un register après `freeze` échouent.

Le registry de production Phase 7 est vide et gelé. Aucun adapter Docker/Synology/Jellyfin n'est
enregistré. L'UI affiche un empty state. Les définitions TEST-ONLY existent uniquement dans
`@dashboard/integrations/test-support` et ne sont pas importées par `apps/web`.

### 2. Config vs secrets

`configJson` ne contient que des paramètres non sensibles. Les secrets passent exclusivement par
`integration.setSecret`. Les DTO exposent `secrets[key].configured` et jamais plaintext, ciphertext,
IV, auth tag ou keyVersion.

### 3. AES-256-GCM, AAD et keyVersion

`@dashboard/secrets` chiffre avec `aes-256-gcm`, IV de 12 octets aléatoires, auth tag GCM.
`SECRET_ENCRYPTION_KEY` est du base64 décodant exactement 32 octets. Absente : pas de clé éphémère ;
`setSecret` et les tests nécessitant des secrets échouent avec `SECRETS_NOT_CONFIGURED`.

L'AAD canonique est `dashboard.integration-secret.v1:<integrationId>:<key>:<keyVersion>`. Copier un
ciphertext vers une autre intégration ou une autre clé échoue. Le decrypt utilise `row.keyVersion`.
La Phase 7 n'expose qu'une clé version 1 ; la rotation complète est différée.

### 4. `config_revision` et résultats stale

La migration `0004` ajoute `config_revision INTEGER NOT NULL DEFAULT 1` avec contrainte `> 0`.
Toute mutation de `baseUrl`, config, `enabled` ou secret incrémente la révision et remet le status à
`unknown`. Le test snapshot la révision N, fait le réseau hors transaction, puis
`UPDATE ... WHERE config_revision = N`. 0 ligne : `STALE_RESULT`, l'état N+1 est conservé.

### 5. SSRF, DNS pinning, TLS

Le client HTTP réutilise `isAllowedHealthAddress` et le resolver de `@dashboard/monitoring` (ADR 0005).
Schémas `http:`/`https:` sans credentials. Loopback, link-local et metadata sont bloqués. LAN privé,
CGNAT et ULA restent autorisés. Résolution unique, connexion à l'IP validée, SNI du hostname original.
Redirects : 0 par défaut. `verifyTls` est vrai par défaut ; `false` est local à l'agent HTTPS de cette
intégration, jamais via `NODE_TLS_REJECT_UNAUTHORIZED`.

### 6. Cache et rate limiter mémoire

`MemoryIntegrationCache` : TTL, max 500 entrées, LRU, invalidation par `integrationId`. Le test de
connexion bypasse le cache. `MemoryTestRateLimiter` : 5 tests / minute / acteur+intégration. La limite
multi-instance est une dette Phase 13 (Redis).

### 7. Phase 8 différée

Pas d'adapter Docker, socket, workers, Redis, WebSocket/SSE, backup, plugins, ni `integration.invoke`
générique.

## Conséquences

- packages `secrets` et `integrations` deviennent métier ;
- une migration `0004` SQLite/PostgreSQL est nécessaire et non destructive ;
- l'UI `/integrations` est utilisable avec un catalogue vide.
