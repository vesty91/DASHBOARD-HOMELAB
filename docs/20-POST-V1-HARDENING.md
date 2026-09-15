# 20 — Post-v1 hardening

Statut : **COMPLETE**.

Phase 20. Pas de `0007`. Pas de mutation d’intégration. Schéma et backup
inchangés (`schemaVersion` 6, backup `formatVersion` 1). Next.js **16.3.5**.
Version produit **1.0.1** (tag `v1.0.1`). `phase-20-complete` pointe le merge
de clôture docs, avant le bump patch.

## Synthèse

| Volet                 | Détail                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| Accessibilité clavier | Toolbar hors GridStack, flèches, `aria-live`, E2E clavier + ACL viewer |
| Tests a11y            | `@axe-core/playwright` WCAG 2A/2AA, aucune règle désactivée            |
| Lighthouse            | `pnpm test:lighthouse`, budgets perf ≥ 0.85 / a11y-BP-SEO ≥ 0.90       |
| GitHub Actions        | runtimes Node 24 (`checkout@v5`, `setup-node@v5`, `bake-action@v7`, …) |
| Supply-chain          | pinning majors `@vN` ; SBOM/provenance conservés                       |
| Smoke HTTPS           | Caddy documenté, openssl local, WS `/api/realtime/ws`, Origin, DB down |
| WebSocket proxy       | Caddy `strip_prefix` vers realtime `/ws`                               |
| Dépendances           | Next 16.3.5, `ws` 8.21.3 ; warning Windows standalone documenté        |

PRs : #46 (20.1), #47 (20.2), #48 (20.3), #49 (20.4), #50 (20.5).

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

## 20.5 Dépendances / Next.js

Audit du 2026-09-15 (`pnpm outdated`, `pnpm audit --audit-level=moderate`).

### Correctifs de sécurité appliqués

| Package                | Avant  | Après      | Motif                                                                                                                                                        |
| ---------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `next`                 | 16.3.2 | **16.3.5** | GHSA-p293-qw3h-jr36 et GHSA-2xp9-vwfh-vxw4 (`>=16.0.0 <16.3.3`). Plus petit palier 16.3.x qui inclut le patch, plus les rustines 16.3.4/16.3.5. Pas de 16.4. |
| `ws` (direct realtime) | 8.18.3 | **8.21.3** | GHSA-96hv-2xvq-fx4p / GHSA-58qx-3vcg-4xpx. Override workspace `ws: 8.21.3`.                                                                                  |

`sharp` (via Next) n’apparaît plus dans l’audit après 16.3.5.

### Non bumpés (volontaire)

- TypeScript 6.0.3 → 7 : majeur.
- esbuild racine 0.25.11 → 0.28 : hors patch sécurité (déjà ≥ 0.25).
- Playwright 1.62.1, turbo 2.10.10, eslint 10.8.1 : pas d’advisory applicable.

### Résiduel audit

`drizzle-kit` → `@esbuild-kit/*` → `esbuild <=0.24.2` (moderate, GHSA-67mh-4wv8-2f99).
C’est le CLI de migrations, pas le runtime production. L’advisory vise le
**dev server** esbuild. Pas d’override global (risque de casser drizzle-kit).

### Warning Windows standalone path length

Message Turbo/Next :

`IO error: provided value is too long when setting link name for apps/web/.next/standalone/node_modules/.pnpm/next@16.3.x_…`

Origine : limite de nom de lien NTFS / `MAX_PATH` sur le graphe pnpm copié dans
`output: "standalone"`. `outputFileTracingRoot` pointe déjà la racine du
monorepo. Impact : bruit local Windows ; le `next build` se termine (exit 0).
Les images Docker/CI Linux ne sont pas concernées. Mitigation : activer les
longs chemins Windows, ou ignorer le warning. Pas de changement
d’architecture de build.
