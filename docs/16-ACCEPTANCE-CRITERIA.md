# 16 — Critères d'acceptation

## AC-001 Installation

Étant donné une machine Docker avec Compose,
quand l'utilisateur lance la stack avec une configuration valide,
alors l'application devient ready et affiche onboarding.

## AC-002 Onboarding

Une instance vierge permet de créer exactement le premier admin.

Après onboarding, l'URL d'onboarding n'autorise plus la création initiale.

## AC-003 Board

Un admin peut créer un board.

Après restart complet :

- board présent ;
- widgets présents ;
- positions présentes.

## AC-004 Mobile layout

Un widget déplacé en mobile ne modifie pas automatiquement la position desktop.

## AC-005 Widget invalid config

Une configuration invalide est refusée par le serveur avec erreur de validation.

## AC-006 Secrets

Une API listant une intégration ne renvoie jamais le secret en clair.

## AC-007 Permission

Un viewer tentant `board.update` via API reçoit forbidden même s'il appelle l'endpoint manuellement.

## AC-008 Integration timeout

Une API externe non répondante produit `TIMEOUT`, pas un écran infini.

## AC-009 Integration unauthorized

Une mauvaise clé API produit un état `unauthorized` distinct de `down`.

## AC-010 Docker read

Un utilisateur autorisé peut lire l'état des containers.

## AC-011 Docker action

Un utilisateur sans `docker.restart` ne peut pas redémarrer un container.

## AC-012 Synology

Une panne Synology ne rend pas le dashboard global indisponible.

Le widget affiche son erreur isolée.

## AC-013 Jellyfin

Une session active remonte dans le widget dans la fenêtre de refresh configurée.

## AC-014 Cache

Deux widgets demandant la même donnée externe dans la même fenêtre de cache ne doivent pas obligatoirement déclencher deux requêtes identiques.

## AC-015 Backup

Un admin peut exporter un backup avec manifest de version.

## AC-016 Restore validation

Un fichier invalide est rejeté avant toute mutation DB.

## AC-017 Logs secrets

Aucun test de connexion ne laisse apparaître API key/token dans les logs.

## AC-018 Build

Toute release doit passer :

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## AC-019 Public board

Un board public ne peut rendre que des widgets marqués `publicSafe`.

## AC-020 Revision conflict

Deux éditions concurrentes détectent le conflit plutôt que d'écraser silencieusement.

## AC-021 Health

`/health/live` reste OK si Jellyfin est down.

`/health/ready` échoue si la DB obligatoire est inaccessible.

## AC-022 No fake data

Aucun widget de production n'affiche de valeurs inventées quand la source est absente.

## AC-023 Error isolation

Une exception d'un widget ne casse pas tout le board.

## AC-024 Upgrade

La migration DB d'une version précédente testée conserve les données de board.

## AC-025 Reverse proxy

Le produit fonctionne derrière un reverse proxy HTTPS avec WebSocket/realtime si activé.
