# 23 — Notification Center & Incidents

Statut : **COMPLETE**.

Phase 23. Migration `0008`. `schemaVersion` 8. Backup `formatVersion` 1.
Tag `phase-23-complete`. Minor produit `v1.3.0`.

Complète les alertes ntfy (Phase 22) par une **boîte de réception in-app**.
Ne remplace pas `automation_runs`, `audit_logs` ni ntfy.

Backup : `notifications`, `incidents` et `incident_events` sont exclus de
l'archive (éphémères). Compat restore 5/6/7 → 8.

## Modèle

### notifications (éphémère, hors backup)

- ciblage `userId`
- `category` : `integration` | `automation` | `system` | `security` | `backup`
- `severity` : `info` | `success` | `warning` | `error` | `critical`
- titre / corps bornés, plain text
- `dedupKey` optionnel (fenêtre de coalescence)
- `readAt` / `dismissedAt` / `expiresAt`
- `sourceIntegrationId` optionnel (revalidé à la lecture)
- `destinationPath` optionnel (chemins internes allowlistés uniquement)

### incidents (éphémère, hors backup)

- un incident **open** max par `(integrationId, kind)`
- `kind` : `availability`
- `status` : `open` | `resolved`
- timeline `incident_events` (`opened` / `resolved` / `note`)
- résumés plain text uniquement (pas de secrets / payloads bruts)

## Moteur d'incidents (Phase 23.2)

Consomme les DomainEvents `integration.status.changed` déjà publiés après
debounce Phase 22 (pas de second boucle de monitoring).

Transitions :

| Statut reçu   | Comportement                                                        |
| ------------- | ------------------------------------------------------------------- |
| `unavailable` | Ouvre un incident `availability` s'il n'en existe pas déjà d'ouvert |
| `available`   | Résout l'incident ouvert le cas échéant                             |
| `unknown`     | No-op                                                               |

Idempotence :

- clé synthétique `status:{integrationId}:{status}:{occurredAt}` sur
  `openingEventId` / `closingEventId` ;
- DOWN dupliqué → no-op (index partiel unique open) ;
- recovery dupliquée → no-op ;
- flap open→resolve→open crée un nouvel incident après résolution.

Notifications in-app :

- ouverture : `severity=error`, `sourceType=incident` ;
- recovery : `severity=success` ;
- destinataires : utilisateurs actifs `SYSTEM_ADMIN` ou avec `integration.read`.

## Permissions

- `notification.read.self`
- `notification.manage.self`
- `incident.read` — list / get / timeline (DTO sûrs ; `integrationId` redacté
  si l'accès source a été révoqué)

`ADMIN` : default-deny. `SYSTEM_ADMIN` : catalogue.

## API

| Route                      | Permission                 | Notes                    |
| -------------------------- | -------------------------- | ------------------------ |
| `notification.permissions` | authentifié                | `{ canRead, canManage }` |
| `notification.list`        | `notification.read.self`   | Pagination cursor        |
| `notification.unreadCount` | `notification.read.self`   | Compteur unread          |
| `notification.markRead`    | `notification.manage.self` | Self-only                |
| `notification.markAllRead` | `notification.manage.self` | Self-only                |
| `notification.dismiss`     | `notification.manage.self` | Soft-dismiss             |
| `incident.permissions`     | authentifié                | `{ canRead }`            |
| `incident.list`            | `incident.read`            | Pagination cursor        |
| `incident.get`             | `incident.read`            | Détail                   |
| `incident.timeline`        | `incident.read`            | Events chronologiques    |

## UI

- Badge + panneau shell (AppShell) — unread, mark read / all, deep-link interne
- `/notifications` — liste dismissible
- `/incidents` — liste + détail timeline

## Rétention

- dismissed / read : 30 jours
- unread : 90 jours
- purge worker périodique

## Realtime

Abonnement `{ kind: "notifications" }`.
Events : `notification.created` | `notification.updated` | `notification.dismissed`.
Filtrage strict `ticket.userId === event.userId`.
