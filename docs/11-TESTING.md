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
- manifest valide (`schemaVersion` 7) ;
- fichier invalide rejeté avant mutation.

### E2E-009 SSO admin

- pages OIDC, audit et sessions self visibles pour SYSTEM_ADMIN.

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
system admin. Ils vérifient aussi le refus transactionnel d'un upgrade avec collision canonique et le
rollback de la création atomique groupe/rôle/membre dans les deux dialectes. Le scénario E2E utilise
une base SQLite temporaire dédiée et couvre setup, erreur
générique, login, admin, logout et route protégée. Les autres packages métier vides conservent
`--passWithNoTests` et n'ont toujours aucune couverture métier.

## 12. Couverture Phase 5

Les packages Apps et Monitoring ont de vrais tests. Ils couvrent validation, RBAC, politique IP,
DNS pinning, statuses HTTP, redirects et timeout. Les repositories couvrent transactions, tags,
reset de health et rejet d'un résultat stale ; l'upgrade Phase 4→5 conserve une App existante.

## 13. Couverture Phase 6

`@dashboard/widgets` n'utilise plus `--passWithNoTests`. Les tests couvrent registry, duplicate id,
immutabilité des metadata, config/version/migrations (y compris migration qui throw), publicSafe,
schémas Clock/Bookmarks/App Tile, URL Bookmarks vide, isolation d'erreur React et recovery du
boundary. Boards/API/DB couvrent first-fit, CRUD item, CAS de révision, projection publique et
concurrence PostgreSQL. L'éditeur web teste le coordinateur : CONFLICT vs VALIDATION_ERROR,
mutation valide après erreur ordinaire, et séquence layout/métadonnées/item sur une seule
révision. L'E2E étend le parcours admin avec ajout/config/reload des trois widgets, publicSafe,
coordinateur autosave/item/métadonnées, et validation Bookmarks sans faux conflit.

## 14. Couverture Phase 7

`@dashboard/secrets` et `@dashboard/integrations` n'utilisent plus `--passWithNoTests`. Les tests
couvrent AES-256-GCM, IV unique, auth tag, AAD, keyVersion, redaction, registry, cache borné,
SSRF, DNS pinning, retries/timeout/body, RBAC, sentinel secret, stale `config_revision`, et
upgrade Phase 6→7 SQLite/PostgreSQL. L'E2E vérifie l'empty state du catalogue de production.

## 15. Couverture Phase 13 fondations

`@dashboard/events`, `@dashboard/worker` et `@dashboard/realtime` ont de vrais tests. Ils couvrent
le bus mémoire, le drop des payloads Redis invalides, les tickets HMAC expirés, `runtime.status`
sans fuite d'URL, le heartbeat worker (y compris `/health/ready` 503 si publish échoue), le bind
configurable, le refus SSE sans ticket, le retry d'abonnement Redis, et le RBAC `settings.read`.
Les tickets portent des subscriptions déjà autorisées. SSE filtre `board.*`, `integration.*` et
`job.*` côté serveur. Tampering, scopes inconnus et tickets oversized sont rejetés.
`integration.data.changed` est un signal d'invalidation : extras/secrets stripés, refetch
uniquement pour l'id autorisé, debounce d'un burst, pas de publish si le refresh échoue.
WebSocket `/ws` réutilise le même filtre, refuse les messages client, borne connexions et
frames, et ping/pong ; SSE `/events` reste le fallback.

## 16. Couverture Phase 16

Tests ciblés : CSP/headers, tRPC GET 405, rate limit restore après RBAC, nonce OIDC
absent / replay / clock skew plafonné, groupes OIDC malformés default-deny, origine
realtime, Docker `exec`/`attach` en POST, archive backup trop grosse. L'E2E
`security-headers.spec.ts` lit les headers de `/login`.

## 17. Couverture Phase 17

Tests unitaires : `assertRuntimeProductionEnv`, contrats `/health/live` et
`/health/ready` (503 sans fuite d'URL), migrate CLI refuse SQLite.
Upgrade AC-024 : SQLite et PostgreSQL seedent un board avant `0006` et
vérifient la persistance. `scripts/check-production-compose.mjs` refuse
`docker.sock`, `privileged`, et les ports postgres/redis. `pnpm test:production`
exerce Compose + health + onboarding HTTP + DB down. Backup v5/v6/v7 inchangé.

## 18. Lighthouse CI (Phase 20)

`pnpm test:lighthouse` lance Chromium Playwright contre `next dev` SQLite et
applique les budgets de `scripts/lighthouse-budgets.mjs`. Rapports dans
`lighthouse-reports/` (gitignoré). Détail : `docs/20-POST-V1-HARDENING.md`.

## 19. Smoke HTTPS reverse-proxy (Phase 20)

`pnpm test:production:https` exerce Caddy devant web + realtime. Assertions :
HTTPS, redirect HTTP→HTTPS, live/ready, CSP/HSTS, cookies `__Secure-` /
session, `/api/realtime/ws` (426 puis 403 Origin invalide / 401 sans ticket),
`/api/realtime/events` 401, tRPC Origin 403, DB down live 200 / ready 503.
Certificats : openssl local (SAN IP), pas d’ACME. Caddy proxifie
`/api/realtime/ws` vers realtime. Détail : `docs/20-POST-V1-HARDENING.md`.

## 20. Audit dépendances (Phase 20)

Next.js **16.3.5** (patches GHSA RCE 16.3.2). `ws` **8.21.3**. Warning Windows
standalone path length documenté, non « corrigé » par un hack de build.

## 21. Actions d'intégration (Phase 21)

`packages/integrations/src/actions.test.ts` couvre RBAC conjonctif, type
d'intégration, IDs, rate limit, double-submit, timeout, HTTP 401/403/500,
config stale, audit allowlist, invalidation cache et signal realtime.

Adapters : `packages/proxmox`, `packages/qbittorrent`, `packages/ntfy`,
`packages/sonarr`, `packages/radarr`, `packages/seerr` (service + policy +
command/request builders). Prowlarr, Grafana et Custom API restent GET-only
(`method !== "GET"` rejeté). E2E : pages d'intégration sans fuite d'URL
d'action vers le navigateur.

## 22. Automations (Phase 22.1)

`packages/automations` valide trigger/action allowlistés, JSON borné, clés
sensibles interdites et revalidation live de l'owner. Le moteur de
conditions (`engine.test.ts`) couvre intervalle, cron UTC, match d'événement,
status-transition, conditions, cooldown et anti-boucle. `packages/db` teste
create/update CAS, owner SET NULL, historique conservé, upgrade 6 → 7
(SQLite et PostgreSQL). Backup exporte `automation_rules` uniquement.
Le scheduler worker (`scheduler.test.ts`, leases SQLite/PostgreSQL) couvre
le claim unique multi-replica, crash after claim, crash after dispatch
(`unknown`, pas de retry), shutdown, Redis down, et échec DB transitoire.
