# 29 — Production Acceptance & Stabilization

Phase 29 **COMPLETE**. Tag `phase-29-complete`. Patch produit `v1.8.1`.

Pas de migration. DB `schemaVersion` **15** (`0000`–`0015`).
Backup `formatVersion` 1 / `schemaVersion` **13** (≠ DB par design).

## Baseline

| Item                          | Valeur                                                   |
| ----------------------------- | -------------------------------------------------------- |
| Start SHA                     | `0c16cde9ab26c73e10e88e6865ddbeb6a03ea7af`               |
| Product before                | `1.8.0` (tag `v1.8.0` @ `f771890` — **ne pas déplacer**) |
| Hotfixes on main ahead of tag | `#102`, `#103` (auth E2E keyboard)                       |
| Target patch                  | `1.8.1`                                                  |

## Workstreams

### 29.1 Documentation / contracts — PASSED

PR `#104`. README + docs réconciliés : migrations `0000`–`0015`, DB 15,
backup 13. Clarification `v1.8.0` vs hotfixes → `1.8.1`. Stabilisation axe
`document-title` (metadata reliability/topology + poll titre).

### 29.2 CI / Lighthouse — PASSED

PR `#105`. Cause racine flake `public-home` : readiness `/health/live` seule
laissait `/` froid sous `next dev`. Fix : warm-up `/` + `/setup` avant audit ;
migrations LH alignées `0000`–`0015` ; port Next éphémère. **Aucun retry de
scores.** Local : `pnpm test:lighthouse` × 3 verts. Pattern clavier `#103`
conservé.

### 29.3 Impact events — PASSED (fix)

Audit : event déclaré mais **jamais émis**. PR `#106` :
`createImpactEventReconciler` — transitions only ; worker sur
`integration.status.changed` ; API après create/delete dépendance ; seed
cold-start sans émission ; payload fermé existant.

### 29.4 Migration / backup / restore — PASSED (no code change)

| Check                          | Result                  |
| ------------------------------ | ----------------------- |
| `db:check:sqlite` / `postgres` | PASSED                  |
| Backup unit tests              | PASSED                  |
| `backup-runtime` round-trip    | PASSED                  |
| New migration                  | NOT_APPLICABLE (aucune) |
| schema remain 15 / backup 13   | PASSED                  |

Inclus durable : users/groups, boards, apps, integrations (ciphertext),
automations config, status/maintenance, SLO + alert policies,
`service_dependencies`. Exclus : rollups, runtime alert/impact,
notifications/incidents, push, automation runs.

### 29.5 Production compose — PASSED

| Check                                     | Result                                  |
| ----------------------------------------- | --------------------------------------- |
| `docker compose config` / contract script | PASSED                                  |
| `pnpm test:production`                    | PASSED (`production smoke ok`)          |
| `pnpm test:production:https`              | PASSED (`https reverse-proxy smoke ok`) |
| WebSocket / health live+ready             | couverts par smokes existants           |
| `pnpm audit --prod`                       | PASSED (no known vulnerabilities)       |

### 29.6 Real homelab — NOT_RUN

Raison : pas de `.env` / credentials production locaux utilisables.
Acceptance déterministe (CI + smokes) suffit pour clôturer Phase 29.

## Security hostile review (summary)

| Area                     | Result                                     |
| ------------------------ | ------------------------------------------ |
| Event injection          | registry fermé ; pas d’action risquée auto |
| Alert / impact storm     | cooldown SLO + seed/diff impact            |
| Secret logging / browser | inchangé ; audit prod clean                |
| Backup secrets           | ciphertext only                            |
| Topology public leak     | hors status pages                          |
| SW private cache         | inchangé (Phase 24)                        |

## Residual debt

1. Snapshot impact **in-memory** : recovery pendant downtime worker peut être
   manquée jusqu’à la prochaine transition (pas de table runtime 0016).
2. Flakes historiques hors scope : rares soft-nav a11y mitigés par poll titre.
3. Real-homelab connectivity acceptance toujours optionnelle.

## Verdict

**PRODUCTION READY** pour le patch `1.8.1` (gates déterministes verts).
