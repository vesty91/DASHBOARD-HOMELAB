# État du bootstrap à auditer par Codex

## Fourni

- [x] documentation produit ;
- [x] AGENTS.md ;
- [x] monorepo pnpm déclaré ;
- [x] Turborepo déclaré ;
- [x] Next.js minimal ;
- [x] Tailwind minimal ;
- [x] Vitest minimal ;
- [x] Playwright minimal ;
- [x] packages métier créés comme frontières ;
- [x] worker/realtime stubs ;
- [x] scripts Windows/Linux ;
- [x] CI initiale ;
- [x] `.env.example`.

## À faire par Codex avant Phase 2

- [ ] vérifier compatibilité exacte de toutes les versions ;
- [ ] appliquer la release sécurité Next.js disponible au moment de l'exécution ;
- [ ] générer `pnpm-lock.yaml` ;
- [ ] installer les dépendances ;
- [ ] corriger les éventuels peers ;
- [ ] décider/configurer lint Next.js final ;
- [ ] décider stratégie de config partagée ;
- [ ] valider `pnpm lint` ;
- [ ] valider `pnpm typecheck` ;
- [ ] valider `pnpm test` ;
- [ ] valider `pnpm build` ;
- [ ] ajouter ADR si un choix structurel change.

Ne pas commencer la DB tant que les quatre gates ne sont pas verts.
