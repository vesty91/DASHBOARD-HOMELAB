# 09 — Sécurité

## 1. Threat model résumé

Actifs sensibles :

- comptes ;
- sessions ;
- tokens API ;
- accès NAS ;
- Docker ;
- données de monitoring ;
- URLs internes ;
- backup.

Attaquants :

- utilisateur non authentifié ;
- utilisateur authentifié faible privilège ;
- service externe compromis ;
- navigateur compromis/XSS ;
- réseau non fiable.

## 2. Secrets au repos

AES-256-GCM.

Pour chaque secret :

- nonce aléatoire unique ;
- auth tag ;
- key version.

Clé racine :

```env
SECRET_ENCRYPTION_KEY=
```

Format Phase 7 : base64 décodant exactement 32 octets.

Génération documentaire (ne pas committer le résultat) :

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Si la variable est absente, l'application démarre mais `integration.setSecret` et les tests
nécessitant des secrets échouent avec `SECRETS_NOT_CONFIGURED`. Aucune clé éphémère n'est générée.
Ne pas stocker cette clé dans la DB. Ne pas réutiliser `AUTH_SECRET`.

## 3. Rotation

Prévoir `keyVersion`.

Procédure future :

1. ajouter nouvelle clé ;
2. déchiffrer ancienne ;
3. rechiffrer ;
4. vérifier ;
5. retirer ancienne.

## 4. XSS

- React escaping par défaut ;
- sanitizer pour Markdown/HTML autorisé ;
- CSP ;
- pas de `dangerouslySetInnerHTML` sans wrapper sécurisé ;
- custom CSS limité.

## 5. CSP

Enforcement (Phase 16) :

- `default-src 'self'` ;
- `script-src 'self' 'unsafe-inline'` (Next.js 16, pas de nonce encore) ;
- `style-src 'self' 'unsafe-inline'` ;
- **pas** de `'unsafe-eval'` ;
- `img-src 'self' data: blob: http: https:` (icônes homelab) ;
- `connect-src 'self' ws: wss:` ;
- `frame-ancestors 'none'` ;
- `object-src 'none'` ;
- `base-uri 'self'` ;
- `form-action 'self'` ;
- `worker-src 'self' blob:` (service workers / workers Next) ;
- `manifest-src 'self'` (Web App Manifest PWA).

## 5bis. PWA / Service Worker (Phase 24)

Règles obligatoires :

- le service worker (`/sw.js`) ne met **jamais** en cache le HTML
  authentifié ni les réponses `/api/**`, tRPC, auth, realtime,
  notifications, intégrations, automations ou backup ;
- navigation : network-first, repli uniquement vers `/offline.html`
  (shell public, sans données privées) ;
- assets autorisés au cache : `/_next/static/**`, `/icons/**`,
  `offline.html`, `manifest.webmanifest` ;
- caches versionnés ; suppression des caches obsolètes à `activate` ;
- taille de cache bornée ;
- `Cache-Control: no-cache` sur `/sw.js` et le manifest pour forcer
  la mise à jour ;
- branding original Homelab Dashboard — aucun asset Homarr.

## 5ter. Web Push (Phase 24.2)

- Opt-in uniquement : aucune souscription automatique.
- `WEB_PUSH_VAPID_PUBLIC_KEY` peut atteindre le client ; la clé privée
  (`WEB_PUSH_VAPID_PRIVATE_KEY`) reste en environnement serveur uniquement
  (jamais navigateur, DB, logs ou backup).
- Endpoints / `p256dh` / `auth` chiffrés AES-256-GCM avec AAD dédié
  (`dashboard.push-subscription.v1`).
- Max 10 abonnements actifs par utilisateur.
- Payload lock-screen minimal par défaut (pas de titres métier, emails,
  torrents, erreurs brutes). Cible de clic : chemins internes allowlistés.
- Émission uniquement depuis le pipeline Notification Center
  (`createForUser`), jamais depuis les adapters / ntfy.
- Réponses push `404` / `410` → désactivation ; erreurs transitoires bornées
  (pas de retry infini).

## 5quater. SLO burn-rate alerts (Phase 27)

- Event registry fermé `slo.burn-rate.changed` (payload safe : pas de series,
  PromQL, URLs, secrets, erreurs brutes).
- Politiques désactivées par défaut ; cooldown + dedup anti-tempête.
- Pas de remédiation auto ; permissions `reliability.read` / `slo.manage`
  revalidées au tick worker.
- Jamais `healthy` sans données éligibles (`insufficient-data`).

## 5quinquies. Service topology (Phase 28)

- Dépendances curatées uniquement (`depends_on`) ; cycles refusés ; bornes
  depth/nodes.
- Permissions `topology.read` / `topology.manage` serveur (pas d’ADMIN
  par défaut).
- `actualStatus` jamais écrasé par l’impact ; `candidateRootCause` non assertif.
- Event `dependency.impact.changed` payload safe ; pas de scan LAN /
  auto-discovery / remédiation.
- Backup inclut `service_dependencies` ; exclut impact dérivé.

### Installation PWA (pas de bouton Install universel)

- **Chromium / Edge** (desktop et Android) : installation via l’UI du
  navigateur (menu « Installer » / `beforeinstallprompt`). Le produit
  n’expose **pas** de CTA Install générique — les APIs ne sont pas
  universelles.
- **iOS Safari** : uniquement « Sur l’écran d’accueil » (Share sheet).
  Pas d’API Install standard équivalente.

### Limitations iOS Web Push

- Sur iOS, Web Push (versions supportées) exige une **PWA installée** sur
  l’écran d’accueil — pas une session Safari en onglet seul.
- Permission utilisateur explicite toujours requise.
- La delivery est plus restrictive que Chrome Android ; le payload reste
  minimal (`buildSafePushPayload` dans `packages/notifications`).

## 6. CSRF

Mutations authentifiées par cookie protégées (`SameSite=Lax`).

`serverActions.allowedOrigins` = hôte de `APP_URL`. tRPC HTTP : POST uniquement.
`backup.export` est une mutation. Un header `Origin` présent doit matcher `APP_URL`
(tRPC et realtime). Les appels sans `Origin` (non navigateur) restent acceptés.

Pas de mutation sensible par GET.

## 7. SSRF

Voir doc intégrations.

Ajouter tests contre :

- localhost non prévu ;
- metadata IP ;
- redirect malicieuse ;
- schéma `file:` ;
- URL avec credentials trompeurs.

Attention : le LAN est une cible légitime du produit. La politique doit distinguer admin autorisé et source externe non fiable.

Les metadata et messages de `integration.test` sont filtrés contre les valeurs de secrets déchiffrées **avant** truncation. Une réponse qui reflète un secret dans un champ anodin (`version`, etc.) est redacted.

La Phase 5 applique la politique détaillée par l'ADR 0005 : résolution complète, validation de toutes
les adresses, normalisation des IPv4 mappées en IPv6, DNS pinning, résolution bornée par le timeout,
redirects manuels, TLS normal et blocage loopback/link-local/metadata. Les endpoints metadata non
link-local `100.100.100.200` et `fd00:ec2::254` sont aussi refusés. Le client d'intégration Phase 7
applique la même policy centralisée et un deadline timer absolu (pas seulement l'inactivité socket).

## 8. Uploads

Pour icônes/backups :

- taille max ;
- type MIME ;
- extension ;
- nom généré ;
- stockage hors exécution ;
- pas de SVG non sanitizé si affiché inline.

## 9. Backup

Le backup contient des données sensibles.

Options :

- export chiffré recommandé (secrets d'intégration déjà AES-256-GCM, jamais de plaintext) ;
- avertissement clair si export portable contient secrets ;
- pas de téléchargement sans `backup.manage`.

Tables éphémères hors archive (Phase 14+) : `audit_logs`, `auth_sessions`,
`automation_runs`, `automation_runtime_state`. Phase 23 ajoute
`notifications`, `incidents` et `incident_events` à cette exclusion.
Phase 24 ajoute `push_subscriptions` (endpoints Web Push chiffrés) à
cette exclusion. Phase 25 **inclut** au backup `status_pages`,
`status_page_services`, `maintenance_windows` et
`maintenance_window_targets` (config durable). Phase 26–27 : `service_slos` +
`slo_alert_policies` (rollups / runtime exclus). Phase 28 **inclut**
`service_dependencies` (impact dérivé exclus). `schemaVersion` backup courant :
**13** (compat restore 5–13). DB `schemaVersion` **15** ≠ backup (volontaire).

## 10. Rate limiting

Sur :

- login local (existant) ;
- setup (5 / 5 min) ;
- backup export / validate / restore (8 / min / acteur, RBAC d'abord) ;
- OIDC save / mappings ;
- révocation de sessions ;
- test connection / actions Docker (existants) ;
- lecture publique status pages (`statusPage.getPublic`, 60 / min / clé).

Le rate limiter n'est pas un substitut au RBAC. Il est process-local (mémoire).

Les status pages publiques n'exposent jamais `sourceIntegrationId`, URL,
IP, credentials ni erreurs brutes. Opt-in strict :
`visibility=public` **et** `enabled=true`.

## 11. Headers

- HSTS si `APP_URL` est HTTPS ;
- X-Content-Type-Options: nosniff ;
- Referrer-Policy: strict-origin-when-cross-origin ;
- Permissions-Policy (camera, microphone, geolocation, payment) ;
- frame-ancestors via CSP.

## 12. Docker

Un accès au daemon Docker est équivalent à un pouvoir très élevé.

Hardening Phase 8 :

- le web ne monte jamais `/var/run/docker.sock` ;
- transport HTTP(S) vers un socket proxy interne uniquement ;
- allowlist exacte d'endpoints côté Dashboard (defense in depth) ;
- refus explicite de `/archive`, `/export`, `/top`, `/changes`, `/exec`, `/attach`, `/kill` ;
- `CONTAINERS=1` + `POST=0` n'est pas suffisant : exiger des contrôles granulaires
  (`ALLOW_ARCHIVE`, `ALLOW_CHANGES`, `ALLOW_EXPORT`, `ALLOW_LOGS`, `ALLOW_TOP` ou équivalent,
  hardening LinuxServer publié le 18 août 2026) ;
- logs sensibles : permission `docker.logs`, jamais auto-chargés, jamais journalisés, 512 KiB max ;
- start/stop/restart seulement ; aucun kill/exec/remove ;
- permissions d'action séparées ; le rôle `ADMIN` par défaut n'obtient pas `docker.*` ;
- rate limit actions 10 / minute / acteur+intégration ;
- POST Docker : `maxRetries = 0`, `maxRedirects = 0` ;
- IDs conteneur = 64 hex lowercase ; aucun path/method arbitrary ;
- SSRF inchangé (LAN OK, loopback/link-local/metadata bloqués) ;
- CA privée optionnelle (`trustedCaPem`) : trust local à la requête, `rejectUnauthorized`
  reste `true`, hostname/SNI conservés, clés privées refusées ;
- `docker.integration.get` : metadata sûre `{ id, name, enabled }` ; un lecteur Docker
  délégué n'a pas besoin de `integration.read` et ne reçoit pas la config ;
- audit persistant des actions Docker différé (aucune table Phase 8).

Voir ADR 0008.

## 12b. Synology

Hardening Phase 9 :

- credentials DSM uniquement côté serveur (`integration_secrets`) ;
- compte DSM (`account`) en configuration, jamais le mot de passe ;
- login POST, jamais `passwd` / `_sid` / OTP dans l'URL ;
- SID via cookie de requête, jamais caché, logout en `finally` ;
- allowlist CGI `entry.cgi` uniquement ;
- pas de FileStation, User, reboot, generic invoke ;
- `ADMIN` par défaut n'obtient pas `synology.read` ;
- POST DSM : `maxRetries = 0`, `maxRedirects = 0` ;
- SSRF inchangé ; `trustedCaPem` identique à Docker ;
- `synology.integration.get` : `{ id, name, enabled }` ;
- 2FA : OTP transitoire, DID chiffré server-managed, jamais renvoyé au navigateur.

Voir ADR 0009.

## 13. Logs

Redaction centralisée de clés nommées :

```text
password
token
secret
apiKey
authorization
cookie
set-cookie
clientSecret
```

## 14. Dépendances

CI :

- lockfile ;
- audit dépendances ;
- Renovate/Dependabot ;
- scans image Docker ;
- version pinning raisonnable.

## 15. Auth admin initial

Protection course condition :

- transaction/lock ;
- endpoint onboarding désactivé après initialisation.

## 16. Tests sécurité

Minimum :

- IDOR board ;
- IDOR integration ;
- privilege escalation ;
- secret response leak ;
- secret log leak ;
- SSRF cases ;
- XSS Markdown ;
- unauthorized Docker action ;
- backup unauthorized.

La Phase 15 ajoute : validation OIDC (issuer, audience, nonce, redirect), account
linking sans takeover email, mapping groupes default-deny, audit sans secrets,
révocation de session immédiate, et backup schéma 6 sans exporter `auth_sessions`.

La Phase 16 ajoute : CSP enforcement, tRPC POST-only, rate limit backup/OIDC/sessions,
origine realtime, cookies session explicites, et tests négatifs Docker POST exec.

## 17. OIDC et sessions (Phase 15+16)

- Authorization Code + PKCE + state + nonce (NextAuth) ;
- replay nonce rejeté ; clock skew max 120 s ;
- linking `issuer+sub` ; email auto-link seulement si configuré et `email_verified` ;
- mapping groupes default-deny ;
- session JWT + `auth_sessions` ; révocation immédiate ;
- cookie HttpOnly / SameSite=Lax / Secure si HTTPS ;
- nouveau `sessionId` à chaque login.

## 18. Risques résiduels (Phase 16)

- `'unsafe-inline'` conservé pour Next.js ;
- rate limit non partagé entre processus / replicas ;
- IP d'audit volontairement absente (`X-Forwarded-For` non fiable, ADR 0003) ;
- RFC1918 autorisé pour les intégrations homelab (loopback / metadata / link-local bloqués) ;
- `audit_logs`, `auth_sessions`, `automation_runs`,
  `automation_runtime_state`, `notifications`, `incidents` et
  `incident_events` exclus du backup.

La Phase 6 ajoute : validation HTTP(S) des Bookmarks sans fetch serveur, `rel="noopener noreferrer"`
pour `new-tab`, projection publique qui omet les configs unsafe, IDOR item (appartenance board
vérifiée serveur), isolation d'erreur par widget sans stack client, distinction CONFLICT vs
erreur de validation dans le coordinateur d'éditeur, et immutabilité réelle des metadata du registry.

La Phase 7 ajoute : AES-256-GCM avec AAD `integrationId`+`key`+`keyVersion`, redaction centralisée,
`integration.test` réservé à `integration.manage`, SSRF/DNS pinning du client d'intégration,
`verifyTls=false` strictement local, cache mémoire borné, et tests de non-fuite du sentinel
`SUPER_SECRET_VALUE_123`.
