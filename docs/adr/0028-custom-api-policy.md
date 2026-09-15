# ADR 0028 — Custom API policy

## Statut

Accepté pour la Phase 18.9 (Custom API).

## Contexte

Les opérateurs homelab veulent afficher une valeur JSON simple extraite d'un
service HTTP interne. Un proxy d'URL arbitraire, un fetch navigateur ou une
bibliothèque JSONPath générique ouvriraient SSRF, fuite de secrets et XSS.

## Décisions

### 1. Package `@dashboard/custom-api`

Composé dans `apps/web`. Jamais importé par `@dashboard/integrations` ni par
`@dashboard/widgets`. HTTP + Zod. Aucune migration DB. `baseUrl` = origine
http(s) uniquement.

### 2. Allowlist d'endpoints, GET uniquement

L'admin déclare jusqu'à 8 endpoints `{ key, label, path }` dans la config
d'intégration. `path` est un pathname absolu sans query, fragment, `..` ni `//`.
Le widget ne référence qu'une `endpointKey`. `assertCustomApiEndpointAllowed`
refuse toute méthode autre que GET et tout pathname hors allowlist.
`maxRetries: 0`, `maxRedirects: 0`. Corps JSON borné (256 KiB).

Interdit : POST/PUT/DELETE, URL widget, proxy générique, query string.

### 3. Auth serveur uniquement

Secrets optionnels `bearerToken` (`Authorization: Bearer`) et `apiKey` (en-tête
allowlisté : `X-Api-Key`, `X-API-Key`, `X-Auth-Token`, `X-Token`). `apiKey` sans
`apiKeyHeader` est `MISCONFIGURED`. Jamais dans l'URL, le DTO, les logs ou le
navigateur.

### 4. Chemin JSON strict

Parseur maison : segments `[A-Za-z0-9_-]{1,64}` et indexes `0..999`. Profondeur
max 8, longueur max 128. Rejet de `$`, `..`, `*`, filtres, quotes,
`__proto__` / `prototype` / `constructor`. Extraction via
`Object.prototype.hasOwnProperty.call` uniquement.

### 5. DTO borné

Modes `text` / `number` / `badge` / `list`. Chaînes tronquées, contrôles
retirés, secrets redactés. Jamais de JSON brut, jamais de HTML, jamais de lien
construit depuis l'amont.

### 6. Permissions

`custom-api.read` en conjonction de `integration.use|manage`. ADMIN par défaut
ne l'obtient pas. Widget `custom-api-value` : `publicSafe=false`. Capability :
`status.read`.

## Conséquences

Les intégrations Custom API ne sont pas une source `service-status` : ce n'est
pas un produit de santé, et un JSON arbitraire ne doit pas polluer l'agrégateur.

## Alternatives rejetées

- Proxy d'URL arbitraire depuis le widget.
- Fetch navigateur (CORS, fuite de secrets, SSRF côté client).
- Bibliothèque JSONPath générique (`$..*`, filtres).
- Capability inventée hors union existante.
