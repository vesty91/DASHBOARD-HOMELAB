# 11 — Stratégie de tests

## 1. Pyramide

### Unit

Rapides, domaine pur.

### Integration

DB, crypto, adapters mock server.

### E2E

Parcours essentiels.

## 2. Unit tests

Couvrir :

- permission resolver ;
- layout validation ;
- board revision ;
- widget registry ;
- integration registry ;
- encryption/decryption ;
- error normalization ;
- URL validation.

## 3. DB integration

Avec DB éphémère.

PostgreSQL via Testcontainers pour CI si possible.

Tests :

- migrations ;
- FK ;
- unique ;
- transactions ;
- rollback ;
- repositories.

Depuis la Phase 2, SQLite applique la migration SQL sur une base en mémoire et teste repositories,
contraintes, FK et rollback. La CI démarre un service PostgreSQL réel, applique sa migration puis
exécute `pnpm --filter @dashboard/db test:postgres`. Le test PostgreSQL est ignoré localement lorsque
`POSTGRES_TEST_URL` est absent ; cette absence n'est pas assimilée à une validation PostgreSQL locale.

## 4. Adapter integration

Utiliser mock HTTP contrôlé.

Tester :

- success ;
- 401 ;
- 403 ;
- timeout ;
- 429 ;
- 500 ;
- invalid JSON ;
- missing fields ;
- huge response.

## 5. E2E Playwright

### E2E-001 onboarding

- instance vierge ;
- création admin ;
- accès dashboard.

### E2E-002 auth

- login ;
- logout ;
- session refusée après logout.

### E2E-003 board

- créer ;
- ouvrir ;
- renommer.

### E2E-004 widget

- ajouter Clock ;
- déplacer ;
- resize ;
- reload ;
- vérifier position.

### E2E-005 integration

- créer intégration mock ;
- test connection ;
- widget connecté.

### E2E-006 permissions

- viewer voit ;
- viewer ne modifie pas ;
- API renvoie forbidden.

### E2E-007 Docker action

- user sans action : forbidden ;
- admin autorisé sur mock.

### E2E-008 backup

- export ;
- manifest valide.

## 6. Tests non fonctionnels

### Performance

Board 50 widgets :

- interaction fluide ;
- pas de requêtes en boucle ;
- mémoire bornée.

### Resilience

- Redis down ;
- worker down ;
- intégration down ;
- DB reconnect.

## 7. CI gates

Obligatoires :

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

En Phase 1, le scénario E2E vérifie uniquement le rendu du bootstrap. Chromium est installé
explicitement dans la CI avant son exécution.

Les packages métier encore vides exécutent Vitest avec `--passWithNoTests`. Cela valide le câblage du
runner, mais ne constitue pas une couverture métier. Des tests seront ajoutés avec chaque capacité des
phases suivantes.

## 8. Coverage

Ne pas viser 100 % artificiel.

Cibles :

- domaine critique > 85 % ;
- crypto/permissions proche de 100 % de branches ;
- UI de présentation moins prioritaire.

## 9. Fixtures

Ne pas faire dépendre tests d'APIs publiques réelles.

Utiliser fixtures versionnées et serveurs mock.

## 10. Migration tests

Pour chaque release DB :

- upgrade N-1 -> N ;
- création DB vide -> N ;
- données principales conservées.

## 11. Couverture Phase 3

`packages/auth` et `packages/permissions` ont désormais de vrais tests sans `--passWithNoTests`.
Les tests DB couvrent l'upgrade Phase 2→3, l'onboarding, l'invalidation et la protection du dernier
system admin. Le scénario E2E utilise une base SQLite temporaire dédiée et couvre setup, erreur
générique, login, admin, logout et route protégée. Les autres packages métier vides conservent
`--passWithNoTests` et n'ont toujours aucune couverture métier.
