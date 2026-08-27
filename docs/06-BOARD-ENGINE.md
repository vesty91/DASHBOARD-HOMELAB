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

La policy resource-level applique la hiérarchie `board.manage > board.edit > board.view`. Le propriétaire et `board.manage.all` gèrent ; `board.read.all` lit ; les ACL directes et de groupe sont résolues séparément. `authenticated` permet seulement la lecture aux comptes actifs et `public` seulement la lecture anonyme.

Un board devient public seulement si tous ses items sont d'un type connu, d'une version supportée, d'une config Zod valide et `publicSafe`. Clock est publiable. Bookmarks et App Tile bloquent la publication. En lecture anonyme d'un board public, les items unsafe, inconnus ou invalides sont omis avec leurs placements (ADR 0006).

`board.item.create`, `board.item.update`, `board.item.delete` et `board.update` (métadonnées) exigent les permissions board correspondantes, consomment `expectedRevision` et incrémentent `board.revision` une seule fois dans une transaction. Un placement first-fit déterministe est créé pour chaque layout existant.

L'éditeur possède un seul propriétaire de `board.revision` : `BoardEditWorkspace` séquence layout autosave, métadonnées, `item.create`, `item.update` et `item.delete` sur la même file. Un `CONFLICT` de révision gèle le coordinateur et exige un reload. Une `VALIDATION_ERROR`, `FORBIDDEN` ou erreur métier ordinaire n'est pas un conflit : le formulaire reste utilisable et la révision n'est pas incrémentée.

La duplication et l'export restent reportés : l'import/backup appartient à la Phase 14.
