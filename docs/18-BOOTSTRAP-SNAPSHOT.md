# 18 — Bootstrap snapshot du 24 août 2026

Versions vérifiées publiquement lors de la génération du starter :

| Composant | Version |
|---|---:|
| Next.js | 16.3.2 |
| React | 19.2.8 |
| React DOM | 19.2.8 |
| pnpm | 11.23.0 |
| Turborepo | 2.10.10 |
| TypeScript | 7.0.2 |
| Vitest | 4.1.11 |
| Playwright | 1.62.1 |
| Tailwind CSS | 4.3.3 |
| Zod | 4.4.3 |
| Prettier | 3.9.6 |
| ESLint | 10.8.1 |
| typescript-eslint | 8.67.0 |

## Avertissement Next.js

Next.js a annoncé le 20 août 2026 une release sécurité planifiée pour le 26 août 2026,
incluant des patches pour Next.js 16.3 et 15.5 et corrigeant notamment une vulnérabilité
de sévérité critique.

Par conséquent :

- ne pas considérer `16.3.2` comme une version définitivement approuvée ;
- avant le premier `pnpm install` final / lockfile de production, vérifier la release de sécurité ;
- mettre à niveau la branche 16.3 vers la version corrigée dès publication ;
- relancer tous les gates.

Le starter ne contient volontairement pas de `pnpm-lock.yaml` généré le 24 août afin de ne pas figer cette version juste avant la release sécurité annoncée.
