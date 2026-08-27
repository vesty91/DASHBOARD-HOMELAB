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

Ne pas stocker cette clé dans la DB.

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

La Phase 5 applique la politique détaillée par l'ADR 0005 : résolution complète, validation de toutes
les adresses, DNS pinning, redirects manuels, TLS normal et blocage loopback/link-local/metadata.

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

Un accès au socket Docker est équivalent à un pouvoir très élevé.

Recommandation :

- socket proxy ;
- API read-only par défaut ;
- actions séparées ;
- audit log ;
- aucun terminal arbitrary exec en V1.

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
