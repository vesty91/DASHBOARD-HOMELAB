# AGENTS.md — Règles obligatoires pour Codex

## 1. Mission

Tu développes un dashboard self-hosted original, inspiré fonctionnellement de produits tels que Homarr, mais possédant sa propre architecture, son propre design, son propre code et son propre branding.

Le produit cible un usage homelab/NAS/monitoring en production.

Tu dois privilégier :

- robustesse ;
- maintenabilité ;
- sécurité ;
- observabilité ;
- tests ;
- migration fiable ;
- comportement déterministe.

## 2. Sources à lire avant toute modification

Avant chaque intervention significative :

1. lire ce fichier ;
2. lire la documentation du module concerné dans `docs/` ;
3. inspecter le code existant ;
4. identifier les tests existants ;
5. vérifier les migrations DB concernées ;
6. établir un plan de modification limité.

Pour les comparaisons fonctionnelles, tu peux consulter `reference/homarr` s'il existe.

`reference/homarr` est une référence documentaire, pas une base à copier.

## 3. Interdictions

Ne jamais :

- modifier `reference/homarr` ;
- copier le logo, le nom, les assets ou l'identité visuelle de Homarr ;
- copier de gros blocs de code source sans justification de licence et attribution ;
- contourner TypeScript avec `any`, `@ts-ignore` ou `@ts-nocheck` sans justification documentée ;
- désactiver un test pour faire passer la CI ;
- supprimer une validation Zod pour contourner un problème ;
- mettre un secret API dans le bundle client ;
- journaliser des mots de passe, tokens, cookies ou clés API ;
- stocker des secrets sensibles en clair ;
- appeler une intégration privée directement depuis le navigateur si cela expose des secrets ou introduit du CORS/SSRF ;
- ajouter des données mock en production pour masquer une API indisponible ;
- avaler une exception avec `catch {}` ;
- mélanger logique DB et composants React ;
- lancer une action destructive sans contrôle de permission et confirmation adaptée ;
- monter directement le socket Docker en production si un socket proxy restreint peut être utilisé.

## 4. Stack cible

Par défaut :

- Node.js LTS récent ;
- pnpm ;
- Turborepo ;
- Next.js App Router ;
- React ;
- TypeScript strict ;
- Tailwind CSS ;
- shadcn/ui ;
- TanStack Query ;
- tRPC ;
- Zod ;
- Drizzle ORM ;
- PostgreSQL en production ;
- SQLite en développement/test léger ;
- Auth.js ;
- Redis pour cache/jobs/pubsub si nécessaire ;
- WebSocket ou SSE pour temps réel ;
- Vitest ;
- Playwright ;
- Docker Compose.

Toute modification de cette stack doit être justifiée par un ADR.

## 5. Architecture

Respecter les frontières :

```text
apps/
  web/
  worker/
  realtime/

packages/
  api/
  auth/
  db/
  boards/
  widgets/
  integrations/
  docker/
  synology/
  permissions/
  secrets/
  monitoring/
  app-library/
  ui/
  shared/
```

Dépendances attendues :

```text
UI -> API client
API -> services métier
services -> repositories/adapters
repositories -> DB
integration adapters -> clients externes
```

Les composants UI ne doivent jamais devenir un accès direct à la DB ou aux secrets.

## 6. Validation

Toutes les entrées externes sont non fiables :

- paramètres URL ;
- body ;
- formulaires ;
- variables environnement ;
- réponses d'intégrations ;
- WebSocket ;
- fichiers importés ;
- configuration de widgets ;
- configuration de boards.

Utiliser des schémas Zod explicites.

Une réponse API externe doit être normalisée avant d'entrer dans le domaine.

## 7. Autorisation

Authentification != autorisation.

Chaque procédure sensible doit vérifier explicitement les permissions serveur.

Exemples :

- `board.view`
- `board.create`
- `board.edit`
- `board.delete`
- `app.manage`
- `integration.use`
- `integration.interact`
- `integration.manage`
- `user.manage`
- `group.manage`
- `settings.manage`
- `backup.manage`

Une UI masquée ne constitue pas une protection.

## 8. Secrets

Les secrets d'intégration doivent :

- être chiffrés au repos avec AES-256-GCM ou équivalent moderne ;
- utiliser une clé racine fournie par environnement ;
- ne jamais être renvoyés en clair par une API de lecture ;
- être remplacés via des opérations dédiées ;
- être redacted dans les logs ;
- être déchiffrés uniquement côté serveur au moment nécessaire.

## 9. Réseau et SSRF

Toute URL d'intégration est potentiellement une source SSRF.

Implémenter :

- validation de schéma `http/https` ;
- timeouts ;
- taille de réponse maximale ;
- redirections limitées ;
- résolution et politique réseau configurable ;
- protection contre accès aux metadata cloud ;
- contrôle des certificats ;
- possibilité explicite d'ajouter des certificats de confiance ;
- pas de `rejectUnauthorized: false` global.

## 10. Base de données

Chaque évolution du schéma doit :

1. modifier le schéma Drizzle ;
2. générer une migration ;
3. être testée ;
4. prévoir les contraintes et indexes ;
5. éviter les suppressions silencieuses ;
6. documenter les migrations destructives.

Utiliser des transactions pour les opérations multi-tables.

## 11. Board engine

Le layout est séparé des items.

Ne pas stocker une position unique directement sur un widget.

Un item peut avoir des positions/taille différentes selon :

- desktop ;
- tablet ;
- mobile ;
- layouts personnalisés.

Toute opération de drag/resize doit être :

- validée ;
- persistée ;
- idempotente autant que possible ;
- protégée par permission ;
- gérée avec stratégie de concurrence.

## 12. Widgets

Chaque widget doit être déclaré via un contrat de type registre.

Un widget définit au minimum :

- id ;
- version ;
- nom ;
- description ;
- tailles min/max/default ;
- schéma de config ;
- dépendances d'intégration ;
- composant ;
- stratégie de données ;
- empty state ;
- loading state ;
- error state.

Ne pas créer une énorme condition `switch(widgetType)` dispersée dans l'application.

## 13. Intégrations

Chaque intégration doit exposer :

- définition ;
- schéma de configuration ;
- schéma de secrets ;
- client ;
- test de connexion ;
- capabilities ;
- normalisation d'erreurs ;
- timeouts ;
- cache ;
- tests.

Les erreurs doivent être typées :

- unauthorized ;
- forbidden ;
- timeout ;
- DNS ;
- TLS ;
- unreachable ;
- invalid-response ;
- rate-limited ;
- unsupported-version ;
- misconfigured.

## 14. Docker

Préférer un Docker Socket Proxy ou une API distante restreinte.

Les actions start/stop/restart nécessitent une permission supérieure à la simple lecture.

Les logs doivent être bornés en taille et paginés/streamés proprement.

## 15. Observabilité

Toute interaction externe doit pouvoir être diagnostiquée sans exposer de secret.

Inclure :

- logs structurés ;
- request/correlation id ;
- métriques de latence ;
- compteur d'erreurs ;
- healthcheck ;
- readiness ;
- job status ;
- historique minimal des checks.

## 16. Tests obligatoires

Pour chaque feature métier :

- unit tests ;
- tests d'intégration ;
- test de permission négatif ;
- test d'erreur externe si intégration.

E2E minimum :

- onboarding admin ;
- login/logout ;
- création board ;
- ajout widget ;
- déplacement/redimensionnement ;
- persistance après reload ;
- configuration intégration ;
- permission refusée ;
- export backup.

## 17. Definition of Done

Avant de déclarer une tâche terminée, exécuter :

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Ajouter les tests nécessaires.

Rapporter précisément :

- fichiers modifiés ;
- migrations ajoutées ;
- tests ajoutés ;
- commandes exécutées ;
- résultat ;
- dette technique restante.

## 18. Méthode de travail

Ne pas construire tout le projet dans un seul changement.

Travailler par milestones atomiques.

Une phase = une capacité utilisable de bout en bout.

Priorité :

1. fondations ;
2. auth ;
3. DB ;
4. board engine ;
5. apps ;
6. widget engine ;
7. integration framework ;
8. intégrations ;
9. temps réel ;
10. backup ;
11. hardening.
