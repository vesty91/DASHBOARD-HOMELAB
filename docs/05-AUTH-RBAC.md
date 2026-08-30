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

Les sessions JWT expirent après `AUTH_SESSION_MAX_AGE_SECONDS` (24 h par défaut). `authVersion` est
vérifié en base à chaque résolution serveur ; les permissions ne sont jamais une source de vérité du
JWT. Voir ADR 0003.

Le schéma Zod de l'environnement serveur est l'unique source de vérité pour cette durée. Les valeurs
doivent être des secondes entières comprises entre 300 et 2 592 000 ; une valeur vide, non numérique
ou hors limites empêche le démarrage au lieu de transmettre une durée invalide à Auth.js.

La limitation login de Phase 3 est volontairement en mémoire et mono-processus. Elle ne fait pas
confiance aux en-têtes forwarded. Redis et la politique proxy distribuée restent au hardening.

## 3. OIDC

Support futur dès conception :

- issuer ;
- client id ;
- client secret ;
- scopes ;
- mapping claims ;
- auto-provisioning configurable ;
- groupe admin jamais accordé par défaut sans règle explicite.

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

La matrice finale est configurable via permissions explicites.

En Phase 5, `app.read` autorise uniquement liste/lecture et `app.manage` autorise CRUD et test manuel.
`app.test` reste interdit au lecteur afin de ne pas transformer le serveur en scanner réseau.

En Phase 7, `integration.read` autorise list/get/catalog. `integration.create` autorise la création.
`integration.manage` autorise update, delete, `setSecret` et `integration.test`. `integration.use` et
`integration.interact` sont consommés par Docker Phase 8. `integration.test` n'est
jamais accordé à un simple lecteur.

Phase 8 n'ajoute aucune permission. Lecture Docker exige
(`integration.use` ou `integration.manage`) **et** (`docker.read` ou `docker.manage`).
Logs / start / stop / restart suivent la même conjonction avec `docker.logs|start|stop|restart`.
Le rôle `ADMIN` par défaut **n'obtient pas** `docker.*`. Seul `SYSTEM_ADMIN` les reçoit toutes ;
la délégation passe par groupes/permissions existants.

## 10. Audit

Actions à journaliser :

- login failure répétée ;
- changement rôle ;
- ajout/suppression permission ;
- création/suppression intégration ;
- modification secret ;
- action Docker ;
- restore backup ;
- rotation clé ;
- changement paramètres sécurité.

## 11. Anti-bruteforce

Prévoir :

- rate limiting par IP + compte ;
- délai exponentiel ;
- message générique ;
- pas d'énumération email.

## 12. CSRF

Si cookies de session utilisés, protéger les mutations selon le mécanisme Auth.js/Next.js choisi et vérifier Origin sur routes sensibles lorsque pertinent.
