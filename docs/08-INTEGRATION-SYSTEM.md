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
- timeout via AbortController ;
- headers ;
- user-agent ;
- max body ;
- JSON parsing ;
- redaction ;
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
- metadata cloud connues ;
- redirections vers protocoles interdits.

Documenter le risque d'un utilisateur ayant `integration.manage`.

## 8. TLS

Options :

- verify système par défaut ;
- certificat custom de confiance ;
- mode insecure uniquement si explicitement activé par admin avec warning.

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
server.info
sessions.read
transcodes.read
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

## 12. Intégration Docker

Priorité 1.

Transport :

- socket proxy ;
- socket unix explicite ;
- TCP/TLS futur.

## 13. Synology

Priorité 1.

Prévoir adapter orienté DSM API.

Ne pas dépendre d'une seule API non officielle si une API officielle est disponible.

## 14. Jellyfin

Utiliser SDK officiel/maintenu si compatible.

## 15. Prometheus

Autoriser un sous-ensemble de requêtes par widget ou permission.

Limiter :

- range ;
- step ;
- volume de séries ;
- timeout.

## 16. Tests intégrations

Pour chaque adapter :

- auth success ;
- auth failure ;
- timeout ;
- invalid JSON ;
- partial response ;
- version unsupported ;
- permission.
