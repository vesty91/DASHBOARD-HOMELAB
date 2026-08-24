# 01 — Audit de Homarr et enseignements

Snapshot : 2026-08-24.

## 1. Objet de l'audit

Homarr est utilisé comme référence fonctionnelle et architecturale.

But :

- comprendre les grandes responsabilités ;
- identifier les bonnes abstractions ;
- éviter de réinventer des problèmes déjà connus ;
- ne pas reproduire inutilement toute sa complexité.

## 2. Observations de structure

Le dépôt Homarr actuel est un monorepo pnpm/Turborepo.

Le workspace comprend des applications distinctes pour notamment :

- documentation ;
- Next.js ;
- tâches ;
- WebSocket.

Le dépôt sépare également de nombreux packages, dont :

- API ;
- auth ;
- boards ;
- DB ;
- Docker ;
- integrations ;
- widgets ;
- notifications ;
- settings ;
- websocket ;
- tasks ;
- validation ;
- UI.

### Enseignement

La séparation domaine/infrastructure est pertinente.

### Décision projet

Conserver le principe, mais réduire le nombre de packages en V1.

## 3. Stack observée

La branche `dev` observée expose notamment :

- Next.js ;
- React ;
- TypeScript ;
- Mantine ;
- TanStack Query ;
- tRPC ;
- Zod ;
- Drizzle ;
- Auth.js / NextAuth ;
- Redis ;
- WebSocket ;
- Vitest ;
- Playwright ;
- Dockerode ;
- clients spécialisés pour diverses intégrations.

### Décision projet

Conserver :

- Next.js ;
- TypeScript ;
- TanStack Query ;
- tRPC ;
- Zod ;
- Drizzle ;
- Auth.js ;
- Redis optionnel ;
- Vitest ;
- Playwright.

Changer la couche UI vers Tailwind + shadcn/ui pour garder une identité visuelle originale et un contrôle CSS plus direct.

## 4. Base de données

Homarr possède des schémas adaptés à :

- SQLite ;
- MySQL ;
- PostgreSQL.

Les entités observées couvrent notamment :

- users ;
- sessions ;
- accounts ;
- apiKeys ;
- apps ;
- boards ;
- layouts ;
- items ;
- sections ;
- permissions ;
- groups ;
- integrations ;
- integrationSecrets ;
- widgets/secrets custom ;
- server settings ;
- cron jobs.

### Enseignement

Le modèle montre clairement que le produit doit séparer :

- contenu métier ;
- layouts ;
- permissions ;
- secrets.

### Décision projet

Support officiel V1 :

- SQLite développement ;
- PostgreSQL production.

MySQL est hors périmètre initial.

## 5. Secrets

Le `.env.example` de Homarr indique :

- une clé `AUTH_SECRET` ;
- une clé de chiffrement distincte pour les secrets d'intégration ;
- une clé de chiffrement de 32 octets recommandée.

### Enseignement

L'authentification et le chiffrement des secrets sont deux responsabilités séparées.

### Décision projet

Utiliser :

- `AUTH_SECRET` pour l'auth ;
- `SECRET_ENCRYPTION_KEY` pour le vault interne des intégrations ;
- AES-256-GCM avec nonce unique.

## 6. Intégrations

Homarr organise les intégrations par service sous un package dédié.

Exemples observables dans le dépôt :

- AdGuard Home ;
- Audiobookshelf ;
- Bazarr ;
- Beszel ;
- Coolify ;
- Emby ;
- Glances ;
- Home Assistant ;
- Jellyfin ;
- Immich ;
- clients de téléchargement ;
- etc.

### Enseignement

Une intégration doit être une unité autonome avec :

- config ;
- secrets ;
- client ;
- capacités ;
- gestion d'erreur ;
- tests.

## 7. Widgets

Homarr possède un package widgets séparé.

### Enseignement

Un widget ne doit pas être codé comme un cas spécial dans le board.

### Décision projet

Créer un `WidgetRegistry` dès le MVP.

## 8. Temps réel

Homarr sépare WebSocket du frontend principal.

### Enseignement

Éviter que le serveur Next.js porte seul les connexions longues et toutes les tâches périodiques.

### Décision projet

Prévoir `apps/realtime` et `apps/worker`, mais rendre leur démarrage optionnel au tout début.

## 9. Docker

Homarr documente l'accès aux sockets Docker et les risques associés.

### Décision projet

Supporter :

1. Docker Socket Proxy recommandé ;
2. socket local en mode explicitement accepté ;
3. TCP/TLS distant dans une phase ultérieure.

## 10. Licence

Le dépôt Homarr observé utilise Apache License 2.0.

Cette licence autorise largement l'usage et les œuvres dérivées sous conditions, mais ne donne pas de droit de marque.

### Règle projet

Nous réalisons une implémentation originale.

Ne pas utiliser :

- marque Homarr ;
- logo Homarr ;
- screenshots comme assets produits ;
- identité visuelle ;
- gros blocs de code copiés.

Si un extrait de code sous Apache 2.0 devait exceptionnellement être repris, conserver les obligations d'attribution et de licence applicables.

## 11. Ce qu'il faut reprendre comme idées

- séparation boards/layouts/items ;
- intégrations modulaires ;
- widgets déclaratifs ;
- RBAC ;
- SSO ;
- chiffrement des secrets ;
- Docker-first ;
- backup/restore ;
- responsive ;
- système de tâches ;
- gestion du temps réel.

## 12. Ce qu'il ne faut pas reprendre immédiatement

- toutes les intégrations ;
- toutes les DB ;
- toute la surface fonctionnelle ;
- toute la complexité de monorepo ;
- toutes les options UI ;
- compatibilité historique avec les anciennes versions.

## 13. Risques identifiés

### Scope creep

Risque majeur : tenter de reproduire Homarr complet avant d'avoir un MVP.

Réponse : roadmap stricte par phases.

### Intégrations fragiles

Les APIs self-hosted évoluent.

Réponse :

- adapter par version ;
- contract tests ;
- erreurs explicites ;
- capability detection.

### SSRF

Un dashboard d'intégrations permet à un utilisateur autorisé de fournir des URLs internes.

Réponse : politique réseau explicite et permissions d'administration.

### Secrets

Risque d'exposition par API/log.

Réponse : vault interne et redaction centralisée.

### Docker root-equivalent

Réponse : proxy restreint et permissions séparées.

## 14. Conclusion d'audit

Homarr valide la pertinence d'une architecture modulaire, mais le nouveau projet doit démarrer avec un noyau plus réduit :

```text
boards
apps
widgets
integrations
auth
rbac
db
secrets
monitoring
```

Le reste vient ensuite.
