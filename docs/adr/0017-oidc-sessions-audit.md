# ADR 0017 — OIDC générique, sessions révocables, audit et backup schéma 6

## Statut

Accepté. Phase 15.

## Contexte

La Phase 14 s'arrête à `schemaVersion` 5 et à la migration `0005`. L'auth locale
(Credentials + JWT + `authVersion`) doit rester opérationnelle. Un second
framework d'authentification n'est pas justifié.

## Décisions

### 1. OIDC générique sur NextAuth 4

Authorization Code Flow, PKCE, `state`, `nonce`. Découverte
`/.well-known/openid-configuration` via `secureRequest` (même politique SSRF
que les intégrations). Les endpoints explicites sont fournis à NextAuth ; pas
de `wellKnown` aveugle. Le client secret utilise AES-256-GCM existant
(`integrationId: "system:oidc"`, `key: "client_secret"`). Les tokens ne sont
jamais loggés ni renvoyés au client.

Redirect autorisé : uniquement `{APP_URL}/api/auth/callback/oidc`.

### 2. Account linking

Identité persistée par `issuer + sub`. L'association automatique par email
n'existe que si `oidcAutoLinkVerifiedEmail` est activé **et** `email_verified
=== true`. Une collision email sans lien `issuer+sub` est rejetée. Le
provisioning optionnel crée un compte `USER`, jamais `SYSTEM_ADMIN`.

### 3. Group mapping default-deny

Seuls les mappings explicites `oidc_group → local_group_id` accordent des
groupes. Un claim absent ou un groupe OIDC inconnu n'ajoute aucune permission.
`isSystemAdmin` n'est jamais dérivé d'OIDC.

### 4. Sessions

Le JWT porte un `jti` (`sessionId`) matérialisé dans `auth_sessions`. Une
session révoquée est refusée à la prochaine résolution JWT/session. Le secret
de session n'est jamais exposé. Logout révoque la session courante.

### 5. Audit

Table `audit_logs`. Métadonnées sanitizées / redacted. IP non dérivée de
`X-Forwarded-For` (ADR 0003). Lecture : `audit.read`, pagination bornée.

### 6. Backup schéma 6

La migration `0006` est requise. `BACKUP_SCHEMA_VERSION = 6`. Inclus :
`oidc_identities`, `oidc_group_mappings`, `oidc_secrets` (ciphertext), colonnes
OIDC de `server_settings`. Exclus volontairement : `audit_logs` (volume, non
requis pour un restore fonctionnel) et `auth_sessions` (secrets de session
actifs). Un archive v5 est acceptée et upgradée en mémoire (tables OIDC vides,
flags OIDC par défaut). v7+ → `INCOMPATIBLE_SCHEMA`.

## Conséquences

Le login local reste le défaut (`oidcAllowLocalLogin`). SYSTEM_ADMIN reçoit
`oidc.manage`, `audit.read` et `session.manage`. Les rôles VIEWER+ reçoivent
`session.read.self` / `session.revoke.self`. ADMIN n'obtient pas oidc/audit/
session.manage par défaut.
