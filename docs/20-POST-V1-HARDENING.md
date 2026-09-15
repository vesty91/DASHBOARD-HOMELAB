# 20 — Post-v1 hardening

Phase 20. Pas de `0007`. Pas de mutation d’intégration. Schéma et backup inchangés.

## 20.1 Accessibilité clavier (board)

GridStack reste le moteur souris. Alternative clavier en édition :

- Tabulation jusqu’au widget (`tabIndex` + `aria-label`) ;
- barre d’actions hors grille : Configurer, Déplacer, Redimensionner, Supprimer ;
- raccourcis `m` / `r`, flèches, Échap ;
- `aria-live` : colonne/ligne, largeur/hauteur.

E2E : `apps/web/e2e/board-keyboard.spec.ts`. Axe WCAG 2A/2AA : `apps/web/e2e/pages-a11y.spec.ts`.
Aucune règle axe désactivée.

## 20.2 Lighthouse / budgets frontend

Commande : `pnpm test:lighthouse` (`scripts/lighthouse-ci.mjs`).

Pourquoi `next dev` + SQLite, pas `next start` :

- `assertRuntimeProductionEnv` n’autorise que PostgreSQL quand `NODE_ENV=production` ;
- la job `quality` a déjà un Postgres pour les tests DB, pas une instance applicative isolée ;
- le budget sert de **détecteur de régression CI**, pas d’un score marketing production.

Pages :

| Label         | URL       | Auth                  |
| ------------- | --------- | --------------------- |
| `public-home` | `/`       | non                   |
| `setup`       | `/setup`  | non                   |
| `login`       | `/login`  | non, après onboarding |
| `boards`      | `/boards` | cookie de session     |

L’éditeur GridStack n’est pas audité ici (couvert par Playwright a11y + clavier). Pas d’appel réseau externe.

Preset : Lighthouse desktop (`desktopConfig`). Chrome = binaire Playwright déjà installé en CI.

### Baseline mesurée

Exécution locale Windows, 2026-09-15, `next dev` + SQLite, Lighthouse 13.4.1
desktop (Chromium Playwright) :

| Page      | Perf | A11y | Best practices | SEO  | Bytes    |
| --------- | ---- | ---- | -------------- | ---- | -------- |
| `/`       | 0.99 | 0.98 | 0.92           | 1.00 | ~921 KiB |
| `/setup`  | 1.00 | 0.98 | 0.92           | 1.00 | ~886 KiB |
| `/login`  | 1.00 | 0.98 | 0.92           | 1.00 | ~904 KiB |
| `/boards` | 1.00 | 1.00 | 0.92           | 1.00 | ~925 KiB |

Best practices à 0.92 en `next dev` : `errors-in-console` (CSP `eval` React
dev), `valid-source-maps`, `inspector-issues`. Aucune de ces audits n’est
exclue. En production `next start` ces trois points ne s’appliquent pas de la
même façon.

### Budgets retenus

Voir `scripts/lighthouse-budgets.mjs`.

| Catégorie           | Seuil         | Raison                                                                    |
| ------------------- | ------------- | ------------------------------------------------------------------------- |
| Accessibility       | ≥ 0.90        | Plancher WCAG, aligné axe 2A/2AA ; baseline 0.98–1.00                     |
| Best Practices      | ≥ 0.90        | Baseline 0.92 ; laisse 0.02 de marge CI sans masquer une vraie régression |
| SEO                 | ≥ 0.90        | Baseline 1.00 (`lang`, title, description)                                |
| Performance         | ≥ 0.85        | Baseline 0.99–1.00 ; marge CI, détecte une chute nette                    |
| `total-byte-weight` | ≤ 1 400 000 o | Baseline ~925 KiB ; ~50 % de marge, pas un freeze du bundle               |

Rapports CI : artefact GitHub Actions `lighthouse-reports` (HTML + JSON + `summary.json`).
