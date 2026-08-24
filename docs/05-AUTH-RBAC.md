# 05 — Authentification et RBAC

## 1. Auth locale

Password hashing :

- Argon2id recommandé ;
- bcrypt acceptable si contrainte de dépendance, avec coût adapté.

Ne jamais stocker un mot de passe réversible.

## 2. Sessions

- cookies HttpOnly ;
- Secure en HTTPS ;
- SameSite adapté ;
- rotation ;
- invalidation ;
- expiration configurable.

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

| Action | Viewer | User | Editor | Admin | System Admin |
|---|---:|---:|---:|---:|---:|
| Voir board autorisé | oui | oui | oui | oui | oui |
| Modifier board autorisé | non | non | oui | oui | oui |
| Créer board | non | oui | oui | oui | oui |
| Gérer intégrations | non | non | non | oui | oui |
| Gérer utilisateurs | non | non | non | oui | oui |
| Paramètres système | non | non | non | non | oui |
| Backup/restore | non | non | non | non | oui |

La matrice finale est configurable via permissions explicites.

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
