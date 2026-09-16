# 23 — Notification Center & Incidents

Statut : **IN PROGRESS**.

Phase 23. Migration `0008`. `schemaVersion` 8. Backup `formatVersion` 1.

Complète les alertes ntfy (Phase 22) par une **boîte de réception in-app**.
Ne remplace pas `automation_runs`, `audit_logs` ni ntfy.

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

| Route                  | Permission      | Notes                 |
| ---------------------- | --------------- | --------------------- |
| `incident.permissions` | authentifié     | `{ canRead }`         |
| `incident.list`        | `incident.read` | Pagination cursor     |
| `incident.get`         | `incident.read` | Détail                |
| `incident.timeline`    | `incident.read` | Events chronologiques |

## Rétention

- dismissed / read : 30 jours
- unread : 90 jours
- purge worker périodique

## Realtime

Abonnement `{ kind: "notifications" }`.
Events : `notification.created` | `notification.updated` | `notification.dismissed`.
Filtrage strict `ticket.userId === event.userId`.
