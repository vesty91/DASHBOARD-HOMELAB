# Template de tâche Codex

## Contexte

Phase :
Module :

Lire :

- `AGENTS.md`
- documentation de la phase concernée.

## Objectif

Décrire une seule capacité testable.

## Hors périmètre

Lister explicitement ce qui ne doit pas être fait.

## Critères d'acceptation

- [ ] comportement principal ;
- [ ] erreur gérée ;
- [ ] permission serveur ;
- [ ] persistance ;
- [ ] tests ;
- [ ] documentation.

## Contraintes

- TypeScript strict ;
- Zod ;
- aucune donnée fictive ;
- aucun secret client ;
- pas de modification architecturale hors sujet.

## Commandes de validation

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Rapport final demandé à Codex

- plan suivi ;
- fichiers modifiés ;
- migrations ;
- tests ;
- commandes exécutées ;
- résultats ;
- risques/dette restante.
