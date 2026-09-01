# 02 — Cahier des charges fonctionnel

## 1. Onboarding

Au premier démarrage :

1. sélectionner langue ;
2. sélectionner thème ;
3. créer compte administrateur ;
4. nommer l'instance ;
5. configurer URL publique facultative ;
6. détecter Docker si autorisé ;
7. proposer un premier board ;
8. terminer.

Critères :

- impossible de créer deux admins initiaux simultanément ;
- onboarding idempotent ;
- pas de compte par défaut ;
- mot de passe conforme à la politique configurée.

## 2. Authentification

V1 :

- username/email + mot de passe ;
- logout ;
- session ;
- renouvellement sécurisé ;
- lockout/rate limiting ;
- reset admin par procédure CLI/documentée si nécessaire.

V1.5 :

- OIDC.

V2 :

- LDAP/AD éventuel.

## 3. Utilisateurs et groupes

CRUD utilisateurs :

- créer ;
- désactiver ;
- réactiver ;
- changer rôle ;
- forcer reset session.

CRUD groupes :

- créer ;
- renommer ;
- membres ;
- permissions.

## 4. Boards

Un board doit avoir :

- id ;
- slug ;
- nom ;
- description ;
- visibilité ;
- propriétaire optionnel ;
- thème ;
- background ;
- custom CSS optionnel ;
- paramètres de grille ;
- layouts.

Actions :

- créer ;
- éditer ;
- dupliquer ;
- supprimer ;
- exporter ;
- réordonner ;
- définir comme home board.

## 5. Layouts

Au minimum :

- desktop ;
- mobile.

Phase suivante :

- tablet ;
- custom breakpoint.

Le layout contient les positions des items.

## 6. Items

Un item de board représente une instance de widget.

Il contient :

- type widget ;
- version de définition ;
- titre custom ;
- config JSON validée ;
- refresh policy ;
- intégration associée si nécessaire.

## 7. Sections

V1.5 :

- sections logiques ;
- titre ;
- pliable ;
- état plié par utilisateur ;
- déplacement groupé.

## 8. Apps

App = raccourci vers un service.

Champs :

- nom ;
- description ;
- URL ;
- icône ;
- couleur ;
- tags ;
- target ;
- healthcheck facultatif.

Actions :

- CRUD ;
- test URL ;
- statut ;
- association à une intégration.

### Bibliothèque d'applications

Le catalogue Phase 7.5 / 7.6 est un ensemble de templates statiques :

- parcourir, rechercher et filtrer des définitions connues ;
- préremplir nom, description, tags, icône locale et target ;
- laisser l'utilisateur saisir l'URL réelle ;
- créer ensuite une App normale via `AppService.create` ;
- exposer un cycle de vie `active` / `legacy` / `retired` et un `replacedBy` optionnel ;
- conserver les hints Docker des définitions anciennes pour une future autodétection.

Une définition n'est pas une instance : pas de statut runtime, pas de latence, pas d'URL inventée.
Les apps legacy restent créables. La création manuelle (« Application personnalisée ») reste disponible.
Aucune migration DB. Aucun client Docker.

## 9. Widgets MVP

### App Tile

Affiche :

- icône ;
- nom ;
- statut ;
- latence facultative.

### Bookmarks

Liste de liens personnalisés.

### Clock

Horloge/date avec timezone.

Phase 6 implémente Clock, Bookmarks et App Tile via le registry. App Tile consomme le catalogue Apps
existant. Service Status et les widgets d'intégration restent hors scope.

La Phase 7 livre uniquement le framework d'intégrations (registry générique vide en production, secrets
chiffrés, test de connexion, SSRF). La Phase 8 enregistre Docker dans la composition application
(`apps/web`), pas dans `createProductionIntegrationRegistry()`. Docker et Synology sont composés
dans l'application. Les médias restent Phase 10+.

### Service Status

État d'un endpoint HTTP.

### System Resources

CPU/RAM/uptime via intégration compatible.

### Docker Containers

Liste et statut.

### Docker Stats

CPU/RAM/IO agrégés.

### Synology System

CPU/RAM/uptime/état.

### Synology Storage

volumes/disques/températures/état.

### Jellyfin Streams

sessions actives et transcodage.

### Immich Stats

photos/vidéos/utilisation serveur.

### Beszel Systems

systèmes et état.

### Uptime Kuma

monitors + statut.

### Prometheus Query

requête PromQL contrôlée et rendu simple.

## 10. Intégrations MVP

### Docker

Phase 8 (COMPLETE, PR #10) : intégration réelle via Docker Socket Proxy
HTTP(S). Le dashboard web ne monte jamais `/var/run/docker.sock`.

Lecture :

- liste de conteneurs (`all=true`, limite 1–200, défaut 100) ;
- inspect sûr (état, health structuré, uptime si running + `StartedAt` valide, restartCount, ports) ;
- health `healthy | unhealthy | starting | none | unknown` sans invention ;
- stats one-shot (`stream=false`) : CPU, mémoire working-set, réseau, block IO ;
- logs bornés sur demande explicite (tail 1–500, défaut 200, 512 KiB max, pas de follow).

Le champ `Image` du conteneur suffit à reconnaître une app via App Library.
L'inventaire complet `GET /images/json` n'est **pas** activé en Phase 8.

Actions :

- start ;
- stop (`t` 0–30 s, défaut 10) ;
- restart (`t` 0–30 s).

Interdit : kill, exec, attach, remove, create, archive, export, top, changes.

La création d'une App depuis un conteneur reconnu ouvre `/apps/new?template=<id>`
sans préremplir d'URL (pas d'IP/port Docker inventés).

### Synology DSM

Phase 9 (IMPLEMENTED / REVIEW sur `phase-9-synology`) : lecture via l'API DSM.

Lecture :

- informations système (modèle, version DSM, uptime, RAM, température si disponibles) ;
- CPU et RAM réels via Utilization ;
- volumes et disques (capacité, utilisé / libre, état, SMART si l'API l'expose).

Vue partielle (`available` / `degraded` / `unavailable`) : un timeout Storage n'invente pas
0 % et n'échoue pas toute la page. 2FA via appareil de confiance (`deviceId` server-managed).
Actions destructives hors V1. Credentials côté serveur uniquement. Compte DSM en configuration
(`account`), mot de passe en secret.

### Jellyfin

Lecture :

- serveur ;
- utilisateurs actifs ;
- sessions ;
- playback ;
- transcoding.

### Immich

Lecture :

- stats serveur ;
- stockage ;
- médias si API le permet.

### Beszel

Lecture :

- systems ;
- metrics résumées ;
- alerts.

### Uptime Kuma

Lecture :

- monitors ;
- status ;
- uptime.

### Prometheus

Lecture :

- instant query ;
- range query ;
- targets optionnels.

V1 : pas de requête arbitraire accessible à tout utilisateur sans permission.

## 11. Recherche globale

V1.5 :

Recherche dans :

- boards ;
- apps ;
- widgets ;
- intégrations.

## 12. Notifications

V1.5 :

Centre interne :

- erreurs d'intégration ;
- monitoring ;
- jobs ;
- mises à jour.

V2 :

- ntfy ;
- Gotify ;
- webhook.

## 13. Backup

Export :

- metadata ;
- DB/config ;
- secrets chiffrés ;
- version schéma ;
- manifest.

Import :

1. upload ;
2. validation ;
3. compatibilité ;
4. preview ;
5. confirmation ;
6. sauvegarde pré-restore ;
7. restore transactionnel autant que possible.

## 14. Administration

Page système :

- version ;
- DB ;
- statut Redis ;
- worker ;
- realtime ;
- uptime ;
- jobs ;
- intégrations dégradées ;
- migrations ;
- santé.

## 15. Kiosk

Un board doit pouvoir s'afficher :

- sans sidebar ;
- sans header ;
- en fullscreen ;
- en refresh automatique ;
- avec accès public seulement si explicitement autorisé.

## 16. Internationalisation

Prévoir architecture i18n dès la V1.

Langues initiales :

- français ;
- anglais.

## 17. Accessibilité

Objectif :

- navigation clavier ;
- focus visible ;
- labels ;
- contrastes ;
- aria ;
- pas d'interaction uniquement par couleur.
