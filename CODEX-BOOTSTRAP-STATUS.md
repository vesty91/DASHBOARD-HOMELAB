# État du bootstrap — Phase 1

Mise à jour : 25 août 2026.

## Fourni et validé

- [x] documentation produit et `AGENTS.md` ;
- [x] monorepo pnpm et Turborepo ;
- [x] application Next.js et Tailwind minimales ;
- [x] packages métier créés comme frontières ;
- [x] worker et realtime limités à des stubs ;
- [x] TypeScript strict, ESLint, Prettier, Vitest et Playwright ;
- [x] scripts Windows/Linux et CI ;
- [x] `.env.example` sans secret réel ;
- [x] `pnpm-lock.yaml` généré et validé ;
- [x] dépendances installées avec pnpm 11.23.0 ;
- [x] validation typée des variables d'environnement connues ;
- [x] contrôle léger des frontières architecturales ;
- [x] configuration Vitest ESM sans migration globale du monorepo ;
- [x] Chromium Playwright installé localement et dans la CI.

## Gates de fin de Phase 1

- [x] `pnpm format` ;
- [x] `pnpm lint` ;
- [x] `pnpm typecheck` ;
- [x] `pnpm test` ;
- [x] `pnpm test:e2e` ;
- [x] `pnpm build`.

## Limites explicites du bootstrap

- Les packages métier sont encore des frontières sans logique métier.
- Ils conservent temporairement `vitest run --passWithNoTests` et n'ont donc aucune couverture métier.
- Les variables DB, Auth, chiffrement et Redis sont validées lorsqu'elles sont définies, mais restent
  optionnelles jusqu'aux phases qui les utilisent.
- Next.js 16.3.2 doit rester sous surveillance jusqu'à la publication de la mise à jour de sécurité
  annoncée pour le 26 août 2026.

La Phase 2 DB n'est pas commencée.
