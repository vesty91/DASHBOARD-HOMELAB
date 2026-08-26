# ADR 0004 — GridStack pour l'édition des layouts

## Contexte

La Phase 4 requiert déplacement, redimensionnement, tactile, layouts desktop/mobile et sérialisation, sous Next.js App Router et React 19. La validation serveur doit rester indépendante de la bibliothèque UI.

## Options étudiées

### GridStack 13.2.0

- licence MIT, version stable et maintenance active lors de la décision ;
- moteur grille, drag, resize, tactile, responsive et types TypeScript fournis ;
- aucun runtime dependency ;
- initialisation impérative uniquement côté client, donc compatible SSR si isolée dans un Client Component ;
- API de sérialisation exploitable à la fin d'une interaction ;
- poids et API impérative plus importants qu'une primitive de drag.

### dnd-kit 6.3.1 et moteur maison

- licence MIT, primitives React et bon contrôle des interactions ;
- ne fournit ni resize ni moteur de placement en grille ;
- exige de réimplémenter collision, contraintes, tactile et sérialisation, avec un risque élevé de divergence entre UI et domaine.

## Décision

Utiliser GridStack 13.2.0 derrière `BoardEditor`. Son modèle ne traverse pas les frontières du domaine : l'adaptateur traduit les nœuds en DTO `{ itemId, x, y, w, h }`. `packages/boards` reste l'autorité pour les bornes et collisions, et le repository valide l'état final projeté dans la transaction.

L'autosave est déclenché après la fin d'interaction, coalescé avec un debounce unique de 400 ms et sérialisé. La lecture utilise une grille CSS sans charger GridStack.

## Conséquences et limites

- GridStack n'est jamais une protection de sécurité.
- L'éditeur est un Client Component ; le read mode reste léger et sans drag/resize.
- Les contrôles standards, le focus visible, les libellés et le switch desktop/mobile restent accessibles, mais le positionnement clavier fin est limité par le moteur choisi.
- La collaboration temps réel et le merge automatique restent hors scope.

## Stratégie de remplacement

Le DTO de placement et la validation déterministe sont indépendants. Un autre adaptateur peut remplacer `BoardEditor` sans migration DB ni changement tRPC.
