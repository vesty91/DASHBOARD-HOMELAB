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

Objectif :

- `default-src 'self'` ;
- script restrictions ;
- frame-src configurable uniquement pour iframe widget ;
- connect-src limité ;
- nonce si nécessaire.

## 6. CSRF

Mutations authentifiées par cookie protégées.

Valider Origin/Host pour opérations critiques.

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

- export chiffré recommandé ;
- avertissement clair si export portable contient secrets ;
- pas de téléchargement par user non admin.

## 10. Rate limiting

Sur :

- login ;
- password reset ;
- test connection ;
- actions Docker ;
- API publiques ;
- import backup.

## 11. Headers

- HSTS si HTTPS ;
- X-Content-Type-Options ;
- Referrer-Policy ;
- Permissions-Policy ;
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

La Phase 6 ajoute : validation HTTP(S) des Bookmarks sans fetch serveur, `rel="noopener noreferrer"`
pour `new-tab`, projection publique qui omet les configs unsafe, IDOR item (appartenance board
vérifiée serveur), isolation d'erreur par widget sans stack client, distinction CONFLICT vs
erreur de validation dans le coordinateur d'éditeur, et immutabilité réelle des metadata du registry.

La Phase 7 ajoute : AES-256-GCM avec AAD `integrationId`+`key`+`keyVersion`, redaction centralisée,
`integration.test` réservé à `integration.manage`, SSRF/DNS pinning du client d'intégration,
`verifyTls=false` strictement local, cache mémoire borné, et tests de non-fuite du sentinel
`SUPER_SECRET_VALUE_123`.
