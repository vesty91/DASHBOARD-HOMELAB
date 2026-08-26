# 06 — Moteur de boards

## 1. Objectif

Le board engine est la fonctionnalité centrale.

Il doit permettre :

- rendu ;
- édition ;
- drag ;
- resize ;
- layouts multiples ;
- persistance ;
- responsive ;
- duplication ;
- export.

## 2. Séparation Item / Layout

Règle absolue :

```text
Item = contenu/configuration
ItemLayout = position/taille pour un layout donné
```

Ne pas mettre `x/y/w/h` dans `items`.

## 3. Breakpoints V1

```text
desktop
mobile
```

Recommandation :

- desktop : 12 colonnes ;
- mobile : 4 colonnes.

Valeurs configurables par layout.

## 4. Grid engine

Évaluer :

- GridStack ;
- dnd-kit + moteur custom.

Critères :

- responsive ;
- resize ;
- collision ;
- touch ;
- performance ;
- sérialisation ;
- licence ;
- accessibilité.

Créer un ADR avant de figer le choix.

## 5. Mode lecture

Le rendu lecture ne doit pas charger les contrôles d'édition.

## 6. Mode édition

Fonctions :

- catalogue widgets ;
- ajout ;
- sélection ;
- déplacement ;
- resize ;
- configuration ;
- duplication ;
- suppression ;
- undo/redo futur.

## 7. Autosave

Éviter une écriture DB par pixel.

Stratégie :

1. état local pendant drag ;
2. debounce ;
3. mutation batch à la fin ;
4. revision check.

## 8. Conflits

Chaque board a `revision`.

Mutation :

```text
input.expectedRevision
```

Serveur :

- si égale : appliquer et incrémenter ;
- sinon : `BOARD_REVISION_CONFLICT`.

## 9. Duplication

Dupliquer transactionnellement :

- board ;
- layouts ;
- items ;
- item layouts ;
- sections ;
- config non secrète.

Ne jamais dupliquer automatiquement des secrets privés sans règle explicite.

## 10. Visibilité

```text
private
authenticated
public
```

Un board public :

- ne doit jamais révéler des données d'intégration marquées sensibles ;
- chaque widget doit indiquer s'il peut être rendu publiquement.

## 11. Kiosk

Options :

- hideHeader ;
- hideSidebar ;
- fullscreen ;
- autoRefresh ;
- theme override.

## 12. Custom CSS

Risque XSS/CSS exfiltration.

V1 recommandation :

- CSS admin-only ;
- sanitizer/policy ;
- pas de HTML arbitraire ;
- CSP stricte.

Possibilité de repousser custom CSS complet à V1.5.

## 13. Performance

Objectifs :

- ne pas refetch toutes les données au mouvement d'un widget ;
- virtualiser les grosses listes internes ;
- partager les requêtes identiques via TanStack Query ;
- limiter refresh minimal configurable.

## 14. Tests

- création board ;
- layouts par défaut ;
- ajout item ;
- resize ;
- move ;
- reload ;
- duplication ;
- conflit revision ;
- permission denied ;
- suppression ;
- public visibility.

# État Phase 4

La création d'un board persiste atomiquement les layouts `desktop` (12 colonnes) et `mobile` (4 colonnes). Les positions sont exclusivement stockées dans `item_layouts`. Toute mutation batch réserve atomiquement `board.revision`, valide l'état final projeté, puis persiste ou rollback intégralement.

La policy resource-level applique la hiérarchie `board.manage > board.edit > board.view`. Le propriétaire et `board.manage.all` gèrent ; `board.read.all` lit ; les ACL directes et de groupe sont résolues séparément. `authenticated` permet seulement la lecture aux comptes actifs et `public` seulement la lecture anonyme. Jusqu'au registre Widget Phase 6, un board contenant des items ne peut pas devenir public.

L'éditeur utilise GridStack derrière un adaptateur local, avec autosave coalescé à 400 ms. Un conflit retourne `BOARD_REVISION_CONFLICT` et impose un rechargement ; aucun écrasement ou merge implicite n'est effectué.

La duplication et l'export sont reportés : la duplication sûre des configurations dépend des contrats Widget Phase 6, et l'import/backup appartient à la Phase 14.
