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
- timeline `incident_events`

## Permissions

- `notification.read.self`
- `notification.manage.self`

`ADMIN` : default-deny. `SYSTEM_ADMIN` : catalogue.

## Rétention

- dismissed / read : 30 jours
- unread : 90 jours
- purge worker périodique

## Realtime

Abonnement `{ kind: "notifications" }`.
Events : `notification.created` | `notification.updated` | `notification.dismissed`.
Filtrage strict `ticket.userId === event.userId`.
