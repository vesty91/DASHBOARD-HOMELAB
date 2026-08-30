# Homelab Dashboard — Starter Codex

> Ce ZIP contient à la fois le pack documentaire et un bootstrap de dépôt Phase 1.
> Commencer par `START-HERE.md`, puis `PROMPT-CODEX-FIRST-RUN.md`.

## Pack documentaire original

# Pack Codex — Dashboard self-hosted inspiré fonctionnellement de Homarr

Snapshot de préparation : 2026-08-24.

Ce dossier est conçu pour être copié à la racine d'un nouveau dépôt puis donné à Codex comme contexte de travail.

## Objectif

Construire une application originale de dashboard self-hosted orientée homelab/NAS/monitoring avec :

- boards personnalisables ;
- applications et raccourcis ;
- widgets ;
- intégrations ;
- monitoring ;
- authentification et RBAC ;
- secrets chiffrés ;
- Docker ;
- Synology DSM ;
- Jellyfin ;
- Immich ;
- Beszel ;
- Uptime Kuma ;
- Prometheus ;
- évolutivité vers Proxmox, Grafana, ntfy et l'écosystème *arr.

Le projet doit s'inspirer des capacités et des principes d'architecture observables dans Homarr, sans recopier son branding, ses assets ou son code de façon aveugle.

## Ordre de lecture obligatoire pour Codex

1. `AGENTS.md`
2. `docs/00-PROJECT-VISION.md`
3. `docs/01-HOMARR-AUDIT.md`
4. `docs/02-FUNCTIONAL-SPEC.md`
5. `docs/03-ARCHITECTURE.md`
6. `docs/04-DATABASE.md`
7. `docs/05-AUTH-RBAC.md`
8. `docs/06-BOARD-ENGINE.md`
9. `docs/07-WIDGET-SYSTEM.md`
10. `docs/08-INTEGRATION-SYSTEM.md`
11. `docs/09-SECURITY.md`
12. `docs/10-DEPLOYMENT.md`
13. `docs/11-TESTING.md`
14. `docs/12-ROADMAP.md`
15. `docs/13-API-CONTRACTS.md`
16. `docs/14-OBSERVABILITY.md`
17. `docs/15-UI-UX.md`
18. `docs/16-ACCEPTANCE-CRITERIA.md`
19. `docs/17-HOMARR-SOURCE-MAP.md`
20. `PROMPT-CODEX-FIRST-RUN.md`

## Principe de livraison

Une phase n'est terminée que si :

- le code compile ;
- `lint` passe ;
- `typecheck` passe ;
- les tests de la phase passent ;
- le build production passe ;
- les migrations sont reproductibles ;
- la documentation est mise à jour ;
- aucune donnée factice n'est utilisée pour masquer une erreur réelle.

## Référence Homarr

Ne pas embarquer Homarr directement dans ce dépôt de travail.

Utiliser les scripts :

- `scripts/clone-homarr-reference.ps1`
- `scripts/clone-homarr-reference.sh`

Ils créent `reference/homarr` comme source documentaire locale.

La référence doit rester en lecture seule du point de vue du développement du produit.

## Docker (Phase 8)

L'intégration Docker se connecte à un **Docker Socket Proxy** HTTP(S) interne, jamais au
socket Unix du daemon depuis l'application web. Exemple de placeholder uniquement :

```text
http://socket-proxy:2375
```

Ne pas publier le port du proxy sur l'hôte. Ne pas utiliser une adresse LAN personnelle
comme configuration du dépôt. Voir `docs/adr/0008-docker-transport-and-endpoint-policy.md`
et `docs/10-DEPLOYMENT.md`.
