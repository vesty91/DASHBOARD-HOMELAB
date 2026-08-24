# Prompt à donner à Codex — première exécution

Tu démarres un nouveau projet de dashboard self-hosted.

Lis intégralement :

- `AGENTS.md`
- `README.md`
- tous les fichiers `docs/*.md`

Ne commence pas immédiatement à développer toutes les fonctionnalités.

## Mission de cette première exécution

1. auditer la documentation fournie ;
2. identifier les contradictions ou zones non spécifiées ;
3. proposer l'arborescence finale du monorepo ;
4. proposer les versions de stack compatibles entre elles ;
5. créer uniquement le squelette du projet ;
6. configurer pnpm + Turborepo ;
7. initialiser `apps/web` ;
8. initialiser les packages fondamentaux sans logique métier complexe ;
9. configurer TypeScript strict ;
10. configurer lint/format ;
11. configurer Vitest ;
12. configurer Playwright ;
13. configurer la validation d'environnement ;
14. ajouter `.env.example` sans secret réel ;
15. ajouter un Dockerfile de développement minimal si utile ;
16. fournir un README développeur ;
17. faire passer lint, typecheck, tests et build.

## Important

N'implémente pas encore :

- Synology ;
- Jellyfin ;
- Docker management ;
- Immich ;
- Beszel ;
- Uptime Kuma ;
- Prometheus ;
- WebSocket complexe ;
- backup ;
- custom widgets.

Ces éléments arriveront dans les phases suivantes.

## Résultat attendu

Un dépôt propre qui compile, avec frontières de packages stables et une CI locale reproductible.

Avant toute modification, donne un plan court.

Après modification, fournis :

- arborescence créée ;
- décisions techniques ;
- commandes exécutées ;
- résultats ;
- points restant à traiter pour la Phase 2.
