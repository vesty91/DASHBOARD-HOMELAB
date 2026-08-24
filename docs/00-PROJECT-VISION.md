# 00 — Vision produit

## 1. Résumé

Créer un dashboard self-hosted moderne permettant d'administrer et de visualiser un homelab depuis une interface unique.

Le produit doit centraliser :

- accès aux applications ;
- statut des services ;
- ressources système ;
- stockage/NAS ;
- conteneurs ;
- médias ;
- monitoring ;
- alertes ;
- dashboards personnalisés.

Il doit fonctionner correctement sur :

- desktop ;
- tablette ;
- mobile ;
- écran mural/kiosque.

## 2. Proposition de valeur

Le produit ne doit pas être un simple lanceur de liens.

Il doit combiner :

1. portail d'applications ;
2. moteur de dashboard ;
3. intégrations avec APIs self-hosted ;
4. monitoring ;
5. actions d'administration contrôlées ;
6. personnalisation avancée ;
7. multi-utilisateur avec permissions.

## 3. Principes

### Self-hosted first

Aucune dépendance cloud obligatoire.

### Local first

Le produit doit pouvoir fonctionner sur un LAN sans accès Internet, hors fonctionnalités nécessitant explicitement Internet (ex. météo).

### Server-side integrations

Les secrets et appels sensibles restent côté serveur.

### Progressive complexity

Une installation simple doit fonctionner avec :

- une app ;
- une DB ;
- zéro Redis si les fonctions avancées ne sont pas activées.

Les fonctions worker/realtime peuvent être activées dans un mode avancé.

### Production capable

Le produit doit supporter :

- PostgreSQL ;
- reverse proxy ;
- TLS ;
- SSO OIDC ;
- sauvegarde ;
- restauration ;
- monitoring.

## 4. Public cible

- utilisateurs de NAS ;
- homelab ;
- administrateurs Docker ;
- utilisateurs Proxmox ;
- utilisateurs de services médias ;
- petites infrastructures personnelles ou TPE.

## 5. Cas d'usage prioritaires

### Dashboard NAS

Afficher :

- état NAS ;
- CPU ;
- RAM ;
- stockage ;
- volumes ;
- température ;
- disques ;
- alertes.

### Dashboard Docker

Afficher :

- conteneurs ;
- statut ;
- health ;
- CPU/RAM ;
- uptime ;
- actions start/stop/restart.

### Dashboard média

Afficher :

- Jellyfin sessions ;
- transcodes ;
- statistiques Immich ;
- état des applications média.

### Dashboard monitoring

Afficher :

- Uptime Kuma ;
- Beszel ;
- Prometheus ;
- alertes ;
- latences.

## 6. Hors périmètre V1

- orchestration complète Kubernetes ;
- éditeur visuel de workflows ;
- remplacement de Grafana ;
- remplacement de Portainer ;
- gestionnaire de mots de passe ;
- SIEM ;
- marketplace de plugins non sandboxés.

## 7. Critère de succès V1

Un utilisateur doit pouvoir installer le produit avec Docker Compose, créer un compte admin, créer un board, ajouter des apps/widgets, connecter au moins Docker/Synology/Jellyfin, puis retrouver sa configuration après redémarrage.

Aucune étape centrale ne doit dépendre de données fictives.
