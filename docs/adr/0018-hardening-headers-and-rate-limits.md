# ADR 0018 — Hardening Phase 16 : headers, CSP, rate limits, origines

## Statut

Accepté. Phase 16.

## Contexte

La Phase 15 a ajouté OIDC, l'audit et les sessions révocables. L'audit
sécurité de la Phase 16 a confirmé des surfaces encore ouvertes : headers HTTP
absents, `backup.export` en query tRPC (GET), pas de rate limit sur backup /
OIDC / sessions / setup, et pas de contrôle d'origine sur realtime.

L'architecture existante (RBAC serveur, `secureRequest`, Docker allowlist,
backup default-deny, cookies NextAuth) n'est pas remplacée.

## Décisions

### 1. Headers et CSP

`apps/web/next.config.ts` envoie une CSP en enforcement, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'`. HSTS uniquement
si `APP_URL` est `https:`.

`script-src` et `style-src` conservent `'unsafe-inline'` : Next.js 16 injecte
encore des scripts/styles inline. `'unsafe-eval'` est interdit. `connect-src`
inclut `ws:` / `wss:` pour le rewrite `/api/realtime/ws`. `img-src` autorise
`http:` / `https:` (icônes homelab).

### 2. CSRF

`serverActions.allowedOrigins` est borné à l'hôte de `APP_URL`. tRPC HTTP n'accepte
plus GET. `backup.export` devient une mutation. Un `Origin` présent et distinct
de `APP_URL` est rejeté (tRPC et realtime). Un `Origin` absent reste accepté
(appels non navigateur, rewrite interne).

### 3. Rate limiting

Limiter mémoire par acteur+action (8 / 60 s) sur backup export/validate/restore,
OIDC save/mappings, révocation de sessions. Setup : 5 / 5 min. Le limiter ne
substitue pas le RBAC (permission d'abord). Login local conserve le limiter
existant. Process-local : pas de Redis (même modèle que le login).

### 4. OIDC nonce

NextAuth `checks: ["pkce", "state", "nonce"]` reste la vérification indépendante
du nonce (cookie consommé avant `signIn`). Notre couche exige un nonce présent,
rejette le replay, et ne compare plus le claim à lui-même. Clock skew plafonné
à 120 s.

### 5. Sessions

Cookie session : `HttpOnly`, `SameSite=Lax`, `Secure` si HTTPS. Un nouveau
`sessionId` est émis à chaque login (anti-fixation).

### 6. Backup

Aucun changement de `schemaVersion` (reste 6). Tests d'attaque : JSON malformé,
tables/colonnes inconnues, plaintext, hash, schéma incompatible, archive trop
grosse. Rate limit restore.

## Conséquences

Risques résiduels documentés dans `docs/09-SECURITY.md` : `'unsafe-inline'`,
rate limit non partagé entre processus, IP d'audit non dérivée de
`X-Forwarded-For` (ADR 0003), RFC1918 autorisé pour les intégrations homelab.
