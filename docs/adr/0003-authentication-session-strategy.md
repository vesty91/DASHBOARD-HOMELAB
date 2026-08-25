# ADR 0003 — Authentification locale et stratégie de session

## Statut

Accepté pour la Phase 3.

## Décision

La dernière version stable, NextAuth.js 4.24.15, est utilisée avec le provider Credentials et une session JWT. Auth.js 5 reste beta au moment de la décision. Le JWT contient uniquement l'identité et `authVersion`; chaque lecture de session recharge l'utilisateur en base et refuse un compte désactivé ou une version périmée. Les permissions restent résolues en base côté serveur.

Les cookies officiels Auth.js sont HttpOnly, SameSite Lax et Secure sous HTTPS. `APP_URL`/`NEXTAUTH_URL` doit être l'URL publique canonique derrière le reverse proxy. L'application ne déduit pas une identité client de `X-Forwarded-For`; la confiance proxy devra être configurée explicitement lors du hardening distribué.

Les mots de passe utilisent Argon2id via `argon2` 0.45.1 avec 64 MiB, trois itérations, parallélisme 1 et sortie 32 octets. Les identifiants sont conservés pour affichage et normalisés NFKC/minuscules dans une colonne unique indépendante des collations.

## Conséquences

Le changement de mot de passe ou la désactivation incrémente `authVersion` et invalide les JWT existants. La limitation en mémoire des tentatives est volontairement locale au processus ; une protection distribuée reste à réaliser avec Redis lors du hardening.
