# ADR 0001 — Contrôle léger des frontières de packages

## Statut

Accepté pour la Phase 1.

## Contexte

`docs/03-ARCHITECTURE.md` interdit explicitement les dépendances `db -> web`,
`integrations -> web`, `shared -> db` et `shared -> next`. Le bootstrap doit vérifier ces
frontières sans introduire un outil d'analyse architectural lourd avant l'existence de logique métier.

## Décision

Le script `scripts/check-architecture-boundaries.mjs` inspecte les champs de dépendances des manifests
concernés et échoue lorsqu'une relation interdite est déclarée. Il est exécuté par `pnpm lint`, donc
localement et dans la CI.

Le contrôle porte volontairement sur les dépendances déclarées. Les règles d'import plus fines seront
évaluées lorsque les packages contiendront de la logique métier et que leurs dépendances réelles seront
établies.

## Conséquences

- aucune dépendance de production supplémentaire ;
- retour déterministe et rapide ;
- les quatre interdictions documentées sont protégées dès la Phase 1 ;
- les imports relatifs traversant les packages ne sont pas analysés par ce contrôle minimal.
