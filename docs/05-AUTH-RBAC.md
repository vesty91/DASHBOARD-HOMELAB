# 05 — Authentification et RBAC

## 1. Auth locale

Password hashing :

- Argon2id recommandé ;
- bcrypt acceptable si contrainte de dépendance, avec coût adapté.

Ne jamais stocker un mot de passe réversible.

Implémentation Phase 3 : NextAuth.js stable 4.24.15, Credentials username/password, Argon2id
(`m=65536`, `t=3`, `p=1`, 32 octets), mots de passe de 12 à 256 caractères. Le username canonique
est NFKC + minuscules et possède une contrainte unique portable.

## 2. Sessions

- cookies HttpOnly ;
- Secure en HTTPS ;
- SameSite adapté ;
- rotation ;
- invalidation ;
- expiration configurable.

Les sessions JWT expirent après `AUTH_SESSION_MAX_AGE_SECONDS` (24 h par défaut). Un
`sessionId` (UUID) est persisté dans `auth_sessions`. `authVersion` et l'état de
révocation sont vérifiés en base à chaque résolution serveur ; les permissions ne
sont jamais une source de vérité du JWT. Voir ADR 0003 et ADR 0017.

Le schéma Zod de l'environnement serveur est l'unique source de vérité pour cette durée. Les valeurs
doivent être des secondes entières comprises entre 300 et 2 592 000 ; une valeur vide, non numérique
ou hors limites empêche le démarrage au lieu de transmettre une durée invalide à Auth.js.

La limitation login de Phase 3 est volontairement en mémoire et mono-processus. Elle ne fait pas
confiance aux en-têtes forwarded. Redis et la politique proxy distribuée restent au hardening.

Un utilisateur peut lister et révoquer ses autres sessions (`session.read.self` /
`session.revoke.self`). Un administrateur avec `session.manage` peut révoquer les
sessions d'un autre compte. Le token/session secret n'est jamais affiché.

## 3. OIDC

Support générique (Authentik, Keycloak, Authelia compatible OIDC) :

- issuer, client id, client secret chiffré, scopes, redirect URI, displayName ;
- Authorization Code + PKCE, state, nonce, validation issuer/audience/exp ;
- association `issuer + sub` ; auto-link email seulement si configuré et vérifié ;
- mapping de groupes explicite, default-deny, jamais SYSTEM_ADMIN via OIDC ;
- login local conservé sauf si `oidcAllowLocalLogin` est désactivé.

Permission `oidc.manage` (SYSTEM_ADMIN par défaut). Voir ADR 0017.

## 4. Rôles

Rôles de confort :

```text
SYSTEM_ADMIN
ADMIN
EDITOR
USER
VIEWER
```

Mais l'autorisation réelle doit reposer sur permissions.

## 5. Permissions globales

```text
user.read
user.manage
group.read
group.manage
board.create
board.read.all
board.manage.all
app.read
app.manage
integration.create
integration.read
integration.manage
settings.read
settings.manage
backup.manage
audit.read
oidc.manage
session.read.self
session.revoke.self
session.manage
```

## 6. Permissions board

```text
board.view
board.edit
board.manage
```

`manage` inclut :

- partager ;
- modifier permissions ;
- supprimer ;
- changer visibilité.

## 7. Permissions intégration

```text
integration.use
integration.interact
integration.manage
```

### use

Lire les données nécessaires aux widgets.

### interact

Déclencher actions non destructives/contrôlées.

### manage

Modifier URL, secrets et configuration.

## 8. Docker permissions fines

Exemple :

```text
docker.read
docker.logs
docker.start
docker.stop
docker.restart
docker.manage
```

Ne pas donner `docker.manage` aux simples viewers.

## 8b. Synology permissions fines

```text
synology.read
```

Ne pas donner `synology.read` aux simples viewers. Lecture seule en Phase 9. L'enrollment OTP
utilise `integration.manage` (`canManageAuth`), pas une permission `synology.manage`.

## 9. Matrice initiale

| Action                  | Viewer | User | Editor | Admin | System Admin |
| ----------------------- | -----: | ---: | -----: | ----: | -----------: |
| Voir board autorisé     |    oui |  oui |    oui |   oui |          oui |
| Modifier board autorisé |    non |  non |    oui |   oui |          oui |
| Créer board             |    non |  oui |    oui |   oui |          oui |
| Gérer intégrations      |    non |  non |    non |   oui |          oui |
| Gérer utilisateurs      |    non |  non |    non |   oui |          oui |
| Paramètres système      |    non |  non |    non |   non |          oui |
| Backup/restore          |    non |  non |    non |   non |          oui |
| OIDC / audit            |    non |  non |    non |   non |          oui |
| Sessions self           |    oui |  oui |    oui |   oui |          oui |

La matrice finale est configurable via permissions explicites.

En Phase 5, `app.read` autorise uniquement liste/lecture et `app.manage` autorise CRUD et test manuel.
`app.test` reste interdit au lecteur afin de ne pas transformer le serveur en scanner réseau.

En Phase 7, `integration.read` autorise list/get/catalog. `integration.create` autorise la création.
`integration.manage` autorise update, delete, `setSecret` et `integration.test`. `integration.use` et
`integration.interact` sont consommés par Docker Phase 8. `integration.test` n'est
jamais accordé à un simple lecteur.

Phase 8 n'ajoute aucune permission. Lecture Docker exige
(`integration.use` ou `integration.manage`) **et** (`docker.read` ou `docker.manage`).
Cette conjonction suffit pour `docker.integration.get` et `/integrations/[id]` Docker :
`integration.read` n'est pas requis et n'est pas accordé implicitement.
Logs / start / stop / restart suivent la même conjonction avec `docker.logs|start|stop|restart`.
Le rôle `ADMIN` par défaut **n'obtient pas** `docker.*`. Seul `SYSTEM_ADMIN` les reçoit toutes ;
la délégation passe par groupes/permissions existants.

Phase 9 : lecture Synology exige (`integration.use` ou `integration.manage`) **et**
`synology.read`. Cette conjonction suffit pour `synology.integration.get` et
`/integrations/[id]` Synology : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `synology.read`. `synology.auth.enrollDevice` / `clearDevice`
exigent `integration.manage`.

La délégation persistante passe par des **permissions supplémentaires de groupe**, gérées
uniquement par `SYSTEM_ADMIN` sur `/admin/groups`. Un rôle interne `GROUP_GRANTS_<groupId>`
est lié au groupe via `group_roles` sans modifier `VIEWER` / `USER` / `EDITOR` / `ADMIN`.
Phase 10 : lecture Jellyfin exige (`integration.use` ou `integration.manage`) **et**
`jellyfin.read`. Cette conjonction suffit pour `jellyfin.integration.get` et
`/integrations/[id]` Jellyfin : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `jellyfin.read`.

Phase 11 : lecture Immich exige (`integration.use` ou `integration.manage`) **et**
`immich.read`. Cette conjonction suffit pour `immich.integration.get` et
`/integrations/[id]` Immich : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `immich.read`.

Phase 12 : lecture Beszel exige (`integration.use` ou `integration.manage`) **et**
`beszel.read`. Cette conjonction suffit pour `beszel.integration.get` et
`/integrations/[id]` Beszel : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `beszel.read`.

Phase 12 : lecture Uptime Kuma exige (`integration.use` ou `integration.manage`) **et**
`uptime-kuma.read`. Cette conjonction suffit pour `uptimeKuma.integration.get` et
`/integrations/[id]` Uptime Kuma : `integration.read` n'est pas requis. Le rôle `ADMIN`
par défaut **n'obtient pas** `uptime-kuma.read`.

Phase 12 : lecture Prometheus exige (`integration.use` ou `integration.manage`) **et**
`prometheus.read`. Cette conjonction suffit pour `prometheus.integration.get` et
`/integrations/[id]` Prometheus : `integration.read` n'est pas requis. Le rôle `ADMIN`
par défaut **n'obtient pas** `prometheus.read`.

Phase 18 : lecture Proxmox exige (`integration.use` ou `integration.manage`) **et**
`proxmox.read`. Cette conjonction suffit pour `proxmox.integration.get` et
`/integrations/[id]` Proxmox : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `proxmox.read`.

Phase 18.2 : lecture Grafana exige (`integration.use` ou `integration.manage`) **et**
`grafana.read`. Cette conjonction suffit pour `grafana.integration.get` et
`/integrations/[id]` Grafana : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `grafana.read`.

Phase 18.3 : lecture ntfy exige (`integration.use` ou `integration.manage`) **et**
`ntfy.read`. Cette conjonction suffit pour `ntfy.integration.get` et
`/integrations/[id]` ntfy : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `ntfy.read`.

Phase 18.4 : lecture Sonarr exige (`integration.use` ou `integration.manage`) **et**
`sonarr.read`. Cette conjonction suffit pour `sonarr.integration.get` et
`/integrations/[id]` Sonarr : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `sonarr.read`.

Phase 18.5 : lecture Radarr exige (`integration.use` ou `integration.manage`) **et**
`radarr.read`. Cette conjonction suffit pour `radarr.integration.get` et
`/integrations/[id]` Radarr : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `radarr.read`.

Phase 18.6 : lecture Prowlarr exige (`integration.use` ou `integration.manage`) **et**
`prowlarr.read`. Cette conjonction suffit pour `prowlarr.integration.get` et
`/integrations/[id]` Prowlarr : `integration.read` n'est pas requis. Le rôle `ADMIN` par
défaut **n'obtient pas** `prowlarr.read`.

`group.manage` ne suffit pas : un `ADMIN` ne peut pas s'accorder `synology.read`, `jellyfin.read`,
`immich.read`, `beszel.read`, `prometheus.read`, `uptime-kuma.read`, `proxmox.read`,
`grafana.read`, `ntfy.read`, `sonarr.read`, `radarr.read`, `prowlarr.read`, `docker.*` ni
`settings.manage`.

## 10. Audit

Journal serveur `audit_logs` (Phase 15). Couvre login, OIDC, utilisateurs,
groupes, permissions, intégrations, secrets (sans contenu), Docker, backup et
sessions. Lecture `audit.read` avec pagination. Jamais de mot de passe, token,
cookie ou clé API.

## 11. Anti-bruteforce

Prévoir :

- rate limiting par IP + compte ;
- délai exponentiel ;
- message générique ;
- pas d'énumération email.

## 12. CSRF

Si cookies de session utilisés, protéger les mutations selon le mécanisme Auth.js/Next.js choisi et vérifier Origin sur routes sensibles lorsque pertinent.
