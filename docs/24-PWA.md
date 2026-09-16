# 24 — Progressive Web App & Web Push

Statut : **COMPLETE**.

Phase 24. Migration `0009`. `schemaVersion` 9. Backup `formatVersion` 1.
Tag `phase-24-complete`. Minor produit `v1.4.0` (release séparée).

PWA installable avec branding **Homelab Dashboard** (jamais Homarr), service
worker sécurisé, shell hors ligne public, et Web Push VAPID opt-in branché
sur le Notification Center (Phase 23).

Backup : `push_subscriptions` est exclus de l’archive (éphémère), avec
`notifications`, `incidents` et `incident_events`. Compat restore
5/6/7/8 → 9.

## PWA (Phase 24.1)

- Manifest `/manifest.webmanifest` + icônes originales.
- Service worker `/sw.js` :
  - **jamais** de cache HTML authentifié ni `/api/**`, tRPC, auth,
    realtime, notifications, intégrations, automations, backup ;
  - navigation network-first, repli uniquement vers `/offline.html` ;
  - assets autorisés : `/_next/static/**`, `/icons/**`, `offline.html`,
    manifest ;
  - caches versionnés, purge à `activate`, taille bornée ;
  - `Cache-Control: no-cache` sur `sw.js` et le manifest.
- CSP : `worker-src 'self' blob:`, `manifest-src 'self'`.
- Pas de bibliothèque PWA volumineuse.

## Web Push (Phase 24.2)

- Opt-in uniquement ; fail-closed si VAPID incomplet
  (`WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`,
  `WEB_PUSH_VAPID_SUBJECT`).
- Clé privée serveur uniquement (jamais navigateur, DB, logs, backup).
- Table `push_subscriptions` : endpoints / `p256dh` / `auth` chiffrés
  AES-256-GCM (AAD `dashboard.push-subscription.v1`), max 10 actifs /
  utilisateur.
- Delivery uniquement depuis `notifications.createForUser`.
- Payload lock-screen minimal ; clic vers chemins internes allowlistés.
- Réponses `404` / `410` → désactivation ; erreurs transitoires bornées.

### API `push.*`

| Route                 | Permission                 | Notes                                         |
| --------------------- | -------------------------- | --------------------------------------------- |
| `push.permissions`    | authentifié                | `{ canRead, canManage, vapidConfigured }`     |
| `push.vapidPublicKey` | `notification.read.self`   | Clé publique seulement ; `null` si incomplet  |
| `push.list`           | `notification.read.self`   | Hash + métadonnées, jamais endpoint/clés      |
| `push.subscribe`      | `notification.manage.self` | Upsert ; max 10 ; fail-closed sans VAPID      |
| `push.unsubscribe`    | `notification.manage.self` | Par `id` ou `endpoint`                        |
| `push.unsubscribeAll` | `notification.manage.self` | Tous les abonnements de l’acteur              |

Réutilise `notification.read.self` / `notification.manage.self`.

## Mobile UX (Phase 24.3)

- `viewport-fit=cover` + `env(safe-area-inset-*)`.
- Cibles tactiles shell ≥ 44px.
- Notification center full-width confortable.
- Préférences push : `/account/security#push` (enable / disable device /
  disable all).
- **Pas** de bouton Install universel :
  - Chromium / Edge : UI navigateur ;
  - iOS Safari : « Sur l’écran d’accueil » uniquement.
- iOS Web Push : PWA sur l’écran d’accueil requise (versions supportées).

## Sécurité / déploiement

Détail : `docs/09-SECURITY.md` §5bis / §5ter, `docs/10-DEPLOYMENT.md` §4bis.
