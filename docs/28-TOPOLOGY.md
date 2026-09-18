# 28 — Service Topology & Impact Analysis

Phase 28 **COMPLETE**. Tag `phase-28-complete`. Minor produit `v1.8.0`.

Migration `0015`. DB `schemaVersion` **15**.
Backup `formatVersion` 1 / `schemaVersion` **13** (≠ DB par design).

## Objectif

Graphe de dépendances **explicite et curaté** pour estimer le rayon d’impact
lorsqu’un service amont est indisponible — sans scan LAN, sans auto-discovery,
sans actions destructives inférées, sans modification des calculs SLO.

## Modèle (0015)

Table `service_dependencies` :

| Champ                   | Notes                           |
| ----------------------- | ------------------------------- |
| `id`                    | UUID                            |
| `upstreamServiceKey`    | UUID intégration amont          |
| `downstreamServiceKey`  | UUID intégration aval           |
| `relationship`          | fermé : `depends_on` uniquement |
| `createdBy`             | acteur (nullable)               |
| `createdAt`/`updatedAt` | timestamps                      |

Contraintes :

- unique `(upstream, downstream, relationship)` ;
- rejet self-loop ;
- rejet service inconnu ;
- **DAG** : cycles refusés (`wouldCreateCycle`) ;
- bornes traversal : `TOPOLOGY_MAX_DEPTH` / `TOPOLOGY_MAX_NODES`.

Permissions : `topology.read` / `topology.manage` (SYSTEM_ADMIN catalogue ;
pas dans le rôle ADMIN par défaut).

Backup : **inclut** `service_dependencies` → backup `schemaVersion` **13**.

## Impact engine

Concepts séparés :

- `actualStatus` : `available` | `unavailable` | `unknown` (jamais écrasé) ;
- `impactStatus` : `none` | `at-risk` | `impacted`.

Règles :

- seed `unavailable` → descendants transitifs `impacted` ;
- upstream `unknown` → dépendants directs `at-risk` (si pas déjà `impacted`) ;
- `candidateRootCause` : heuristique (score blast-radius) — **jamais** assertif ;
- traversal BFS borné (depth + nodes) → `truncated` si limite atteinte ;
- n’altère **pas** les calculs SLO / burn-rate.

Event fermé `dependency.impact.changed` — payload safe :

`serviceKey`, `impactStatus`, `candidateRootCause`, `occurredAt`.

Émission (Phase 29) :

- worker : sur `integration.status.changed` (transitions only) ;
- API : après create/delete de dépendance ;
- snapshot in-memory : cold start seed sans émission (anti-storm restart) ;
- pas d’émission si `impactStatus` inchangé ; dry-run sans side-effect.

Automation allowlist : conditions `serviceKey` / `impactStatus`.

## UI `/topology`

- table services (état réel + impact, labels texte) ;
- table dépendances + liste accessible équivalente (pas de drag-only) ;
- formulaire create / delete (confirmation) ;
- mobile : liste prioritaire ;
- bornes UI : 100 services / 200 arêtes affichées.

## Sécurité (audit close)

| Risque                     | Mitigation                                          |
| -------------------------- | --------------------------------------------------- |
| Énumération d’IDs          | labels sûrs ; pas d’IP/hostname dans l’UI topologie |
| Accès cross-user           | RBAC `topology.read` / `topology.manage` serveur    |
| Fuite hostname/IP          | DTO = UUID + labels intégration déjà autorisés      |
| DoS graphe / traversal     | max depth/nodes ; max rows backup/list              |
| Abuse cycles               | rejet cycle à la création                           |
| Injection event            | registry fermé `dependency.impact.changed`          |
| Sur-affirmation root-cause | libellé « candidat » uniquement                     |
| Fuite status publique      | topologie hors status pages publiques               |

## Hors scope

Scan LAN, auto-discovery, remédiation auto, overwrite `actualStatus`,
inférence topologique dans les SLO.
