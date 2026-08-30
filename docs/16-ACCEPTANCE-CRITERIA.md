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
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
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

## AC-026 Apps

Une App validée persiste avec ses tags et son target. Un lecteur ne peut ni muter ni tester. Le test
manuel ne suit pas les redirects, bloque loopback/metadata, autorise le LAN et ne remplace jamais
l'état d'une configuration plus récente.

## AC-027 Widget Engine

Le registry built-in contient exactement `clock`, `bookmarks` et `app-tile`. Une config invalide est rejetée côté serveur. Clock, Bookmarks et App Tile persistent après reload sans donnée inventée. Les mutations d'item incrémentent `board.revision`. Une exception d'un widget n'arrête pas les autres. Clock-only peut être public ; Bookmarks/App Tile/inconnu bloquent la publication et ne fuient pas en lecture anonyme.

## AC-028 Integration Framework

Le registry de production Phase 7 ne contient aucun adapter. Les secrets sont chiffrés AES-256-GCM au
repos et jamais renvoyés en clair, ni en ciphertext. `integration.test` exige `integration.manage`.
Le client HTTP bloque loopback/metadata, autorise le LAN, pin le DNS et ne suit pas les redirects.
Un résultat de test stale n'écrase pas une révision plus récente. SQLite et PostgreSQL restent à
parité, y compris `config_revision`.

## AC-029 Application Library

Le catalogue built-in contient au moins 85 définitions statiques, sans App fictive ni URL
utilisateur inventée. Les icônes sont locales (`/app-icons/...`) et ne dépendent d'aucun CDN au
runtime. La création depuis un template produit une App normale indépendante ; l'App personnalisée
reste possible. Aucun client Docker n'est appelé. Aucune migration DB n'est ajoutée.

## AC-030 Application Library lifecycle

Seerr est `active`. Jellyseerr et Overseerr sont `legacy` avec `replacedBy: seerr`. Readarr est
`retired` et n'apparaît pas dans la liste active par défaut, mais reste trouvable. Portainer
utilise HTTPS 9443. UniFi Network Application utilise `linuxserver/unifi-network-application`
comme image primaire. Les apps legacy restent créables. Le matcher Docker reste une comparaison
de strings, sans accès Docker runtime.

## AC-031 Docker Integration

Docker est le premier adapter de production, composé dans `apps/web`, pas dans le registry
générique Phase 7. Le transport est HTTP(S) vers un Docker Socket Proxy restreint. Un
utilisateur autorisé (`integration.use|manage` et `docker.read|manage`) peut lister et
inspecter les conteneurs. Un utilisateur sans `docker.restart` reçoit `FORBIDDEN` sur
restart, y compris en appel API manuel (AC-011 reste vrai). L'allowlist d'endpoints est
exacte ; aucun generic invoke ni path/method arbitrary. Les IDs exposés à l'API sont 64 hex
lowercase. Les DTO excluent Env, Labels, Mounts, Command et HostConfig. Les logs sont bornés,
chargés uniquement sur demande, et exigent `docker.logs`. Les actions se limitent à
start/stop/restart ; kill/exec/remove sont absents. Le web ne monte pas `docker.sock`.
La reconnaissance réutilise App Library et n'invente aucune URL d'application. Aucune
migration DB. Aucune fake data de production. Pas de widget Docker dans cette phase.
