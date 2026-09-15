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

## 20.3 GitHub Actions / supply chain

Objectif : supprimer les runtimes Node 20 dépréciés des actions, sans casser
CI, bake multi-arch, GHCR, SBOM ni provenance.

| Action                       | Avant | Après | Motif                                                                                                         |
| ---------------------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------- |
| `actions/checkout`           | v4    | v5    | runtime `node24` (v5.0.0)                                                                                     |
| `actions/setup-node`         | v4    | v5    | runtime `node24` ; `package-manager-cache: false` car `packageManager` activerait le cache auto (breaking v5) |
| `actions/upload-artifact`    | v4    | v6    | v5 tournait encore sur Node 20 par défaut ; v6 = `node24`                                                     |
| `docker/setup-buildx-action` | v3    | v4    | runtime `node24`                                                                                              |
| `docker/setup-qemu-action`   | v3    | v4    | runtime `node24`                                                                                              |
| `docker/login-action`        | v3    | v4    | runtime `node24`                                                                                              |
| `docker/bake-action`         | v6    | v7    | runtime `node24` ; `source: .` conservé ; `sbom: true` / `provenance: true` inchangés                         |

Non retenus : `checkout@v6/v7` (sûreté `pull_request_target`, hors de nos triggers),
`setup-node@v6/v7` (cache npm / ESM, sans gain Node 24), `upload-artifact@v7`
(uploads non zip, non utilisés).

### Pinning

Le dépôt pinne déjà les **majors** (`@v5`, `@v7`), pas les SHA. On conserve
cette politique : un pin SHA de toutes les actions Docker/GitHub rendrait la
maintenance trop lourde pour le bénéfice, alors que les majors Node 24
éliminent l’avertissement visé. Les tags git produit (`v1.0.0`,
`phase-19-complete`, etc.) restent intouchables. Pas de publication `v1.0.1`
dans cette PR.

## 20.4 Smoke HTTPS / Caddy / realtime

Commande : `pnpm test:production:https` (`scripts/https-proxy-smoke.mjs`).

Topologie inchangée : `compose.yaml` + `compose.proxy.yaml` `--profile proxy`.
Le Caddyfile de production (`deploy/Caddyfile`) reste ACME. Le smoke pointe
`CADDYFILE` vers `deploy/Caddyfile.https-smoke` : même `reverse_proxy` web +
WebSocket realtime, TLS fichier (openssl, SAN `IP:127.0.0.1`). Aucun ACME
public. `compose.proxy.smoke.yaml` monte le répertoire de certificats.

Origine locale : `APP_URL=https://127.0.0.1:18443` (ports smoke 18080/18443,
pour ne pas collisionner avec 8080/8443 déjà utilisés sur un homelab).
L’overlay Compose conserve les défauts documentés 8080/8443.
Le client Node charge `cert.pem` comme CA et vérifie TLS
(`rejectUnauthorized: true`). L’application ne désactive jamais la
vérification TLS.

Caddy route `/api/realtime/ws` vers `realtime:3002/ws` : le rewrite Next.js
standalone ne termine pas l’Upgrade (constaté pendant ce smoke).

HSTS : `next.config.ts` `headers()` est évalué au **build**. Les images
GHCR n’ont pas `APP_URL=https` au bake. `apps/web/src/proxy.ts` (Next.js 16)
ajoute `Strict-Transport-Security` lorsque `APP_URL` commence par `https:`.

CI : job `containers`, après le smoke HTTP, `SKIP_BUILD=1` (images bake, pas
un second `docker build`).
