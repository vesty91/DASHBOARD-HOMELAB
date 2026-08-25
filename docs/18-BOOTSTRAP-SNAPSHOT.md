# 18 — Bootstrap snapshot

Snapshot initial du 24 août 2026, validé localement le 25 août 2026 avec Node.js 24.19.0 et
pnpm 11.23.0.

| Composant         | Version |
| ----------------- | ------: |
| Next.js           |  16.3.2 |
| React             |  19.2.8 |
| React DOM         |  19.2.8 |
| pnpm              | 11.23.0 |
| Turborepo         | 2.10.10 |
| TypeScript        |   6.0.3 |
| Vitest            |  4.1.11 |
| Playwright        |  1.62.1 |
| Tailwind CSS      |   4.3.3 |
| Zod               |   4.4.3 |
| Prettier          |   3.9.6 |
| ESLint            |  10.8.1 |
| typescript-eslint |  8.67.0 |

## État validé de la Phase 1

Le dépôt contient désormais un `pnpm-lock.yaml`. Les dépendances ont été installées et les gates de
Phase 1 ont été exécutées avec succès : formatage, lint, typecheck, tests unitaires, test E2E Chromium
et build Next.js.

Vitest est chargé depuis `apps/web/vitest.config.mts`, sans basculer globalement le monorepo en ESM.
Les tests Web couvrent le câblage du bootstrap et la validation des variables d'environnement. Le test
Playwright vérifie le rendu de la page d'accueil avec Chromium.

Les packages métier sans logique conservent `--passWithNoTests`. Ils n'ont encore aucun test métier et
ne doivent pas être interprétés comme couverts.

## Avertissement Next.js

Next.js a annoncé le 20 août 2026 une release sécurité planifiée pour le 26 août 2026,
incluant des patches pour Next.js 16.3 et 15.5 et corrigeant notamment une vulnérabilité
de sévérité critique.

Par conséquent :

- ne pas considérer `16.3.2` comme une version définitivement approuvée ;
- mettre à niveau la branche 16.3 vers la version corrigée dès publication ;
- relancer tous les gates après cette future mise à niveau.
