# 21 — Safe integration actions

Phase 21. Pas de `0007`. Schéma 6 / backup `formatVersion` 1 inchangés.

Ce n'est **pas** un proxy d'administration générique : pas d'invoke arbitraire,
pas de REST proxy, pas de POST libre, pas de shell.

## Contrat

Toute mutation externe passe par `runSafeIntegrationAction`
(`@dashboard/integrations`) et reprend le pattern Docker Phase 8.

1. Session authentifiée (`UNAUTHORIZED` sinon).
2. `integration.interact` **ou** `integration.manage`.
3. Permission **spécialisée** explicite (`docker.start`, plus tard `proxmox.start`, …).
4. Type d'intégration attendu.
5. Entrées Zod / IDs bornés.
6. Méthode **POST** uniquement ; chemin construit puis **allowlist exacte**.
7. Rate limit par `action:integrationId:actorId` (algorithme Phase 16,
   `createInMemoryActionRateLimiter` / `integrationActionRateKey`,
   ou `MemorySafeActionRateLimiter`).
8. Garde anti double-submit optionnelle (`MemorySafeActionInFlightGuard`).
9. Fence `expectedConfigRevision` → `CONFLICT` si la config a changé.
10. Timeout et erreurs typées (`TIMEOUT`, `UNAUTHORIZED`, `FORBIDDEN`,
    `INVALID_RESPONSE`, …).
11. Invalidation cache + publish realtime **uniquement après** `success` /
    `accepted`. Pas d'optimistic UI.
12. Audit **après succès** côté tRPC, metadata :

    `{ integrationId, integrationType, action, resourceId, result }`

    Jamais mot de passe, token, cookie, URL credentialisée, corps de message.

## Default deny

`*.read` ne déclenche aucune écriture.

`integration.manage` **seul** ne déclenche aucune action métier.

`SYSTEM_ADMIN` reçoit le catalogue complet, comme aujourd'hui.

## DTO

```ts
{
  status: "success" | "accepted" | "failed";
  action: string;
  resourceId: string;
  occurredAt: string; // ISO-8601 ms UTC
}
```

Jamais de réponse brute, headers, credentials, commande interne.

## UI

Bouton explicite, état `busy` (anti double-submit), feedback succès/erreur.
Confirmation obligatoire pour les actions disruptives (stop / shutdown / reboot
/ decline). Pas d'action au rendu.

## Référence existante

Docker `start` / `stop` / `restart` reste le cas d'usage production. Les
adapters Phase 21 doivent réutiliser ce framework plutôt qu'une seconde
architecture.

## Hors scope de cette coupe (21.1)

Implémentation Proxmox / qBittorrent / ntfy / *arr / Seerr : PRs suivantes.
Grafana et Custom API restent en lecture seule.
