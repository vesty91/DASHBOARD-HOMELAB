# 15 — UI / UX

## 1. Identité

Créer une identité originale.

Ne pas reproduire visuellement Homarr pixel pour pixel.

## 2. Style

- dark-first ;
- clair disponible ;
- dense mais lisible ;
- animation discrète ;
- surfaces cohérentes ;
- navigation rapide.

## 3. Shell admin

Desktop :

```text
┌───────────────────────────────────────────────────┐
│ Top bar: recherche, alertes, profil              │
├──────────────┬────────────────────────────────────┤
│ Sidebar      │ Contenu                            │
│ Boards       │                                    │
│ Apps         │                                    │
│ Integrations │                                    │
│ Monitoring   │                                    │
│ Users        │                                    │
│ Settings     │                                    │
└──────────────┴────────────────────────────────────┘
```

## 4. Board

En lecture :

- chrome minimal ;
- widgets ;
- header optionnel.

En édition :

- grid visible ;
- toolbar ;
- catalogue widgets ;
- panneau propriétés.

## 5. Widget card

Structure :

- header facultatif ;
- status ;
- body ;
- footer facultatif ;
- menu edit uniquement mode édition.

## 6. Responsive

Ne pas simplement écraser le desktop en une colonne.

Utiliser layouts mobiles persistés.

## 7. Loading

Préférer skeletons stables.

Éviter layout shift.

## 8. Erreurs

Exemple widget :

```text
Jellyfin
Connexion impossible
Timeout après 8 s
[Réessayer]
```

Pas :

```text
Something went wrong
```

## 9. État non configuré

Doit être distinct de panne.

```text
Intégration non configurée
[Configurer]
```

## 10. Permissions

Si un user n'a pas permission de configurer :

- ne pas afficher bouton inutilisable ;
- serveur protège quand même.

## 11. Accessibility

- clavier ;
- focus ;
- aria labels ;
- drag avec alternative clavier autant que possible ;
- contrastes WCAG raisonnables.

## 12. Icônes

Le catalogue Phase 7.5 affiche des icônes locales vendored (`/app-icons/<slug>.svg`) via `<img>`.
Les URL HTTP(S) existantes restent valides. Un fallback générique remplace une image cassée.
Aucun SVG n'est injecté en HTML.

`/apps` liste les Apps créées. `/apps/library` parcourt le catalogue : recherche, filtres
catégories, cards clavier, CTA « Application personnalisée ». Aucun badge online/status sur une
définition.

## 13. Search/Spotlight

Phase 1.5 :

`Ctrl+K` / `Cmd+K`.

Résultats :

- apps ;
- boards ;
- actions autorisées.
