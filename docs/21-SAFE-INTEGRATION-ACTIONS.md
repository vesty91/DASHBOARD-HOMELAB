# 21 — Safe integration actions

Phase 21. Pas de `0007`. Schéma 6 / backup `formatVersion` 1 inchangés.

Ce n'est **pas** un proxy d'administration générique : pas d'invoke arbitraire,
pas de REST proxy, pas de POST libre, pas de shell.

## Contrat

Toute mutation externe passe par `runSafeIntegrationAction`
(`@dashboard/integrations`) et reprend le pattern Docker Phase 8.

1. Session authentifiée (`UNAUTHORIZED` sinon).
2. `integration.interact` **ou** `integration.manage`.
3. Permission **spécialisée** explicite (`docker.start`, `proxmox.start`,
   `qbittorrent.pause`, `ntfy.publish`, `sonarr.command`, `radarr.command`, …).
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

## Hors scope de 21.1

Implémentation Seerr : PR suivante.
Grafana et Custom API restent en lecture seule.

## 21.2 Proxmox power

Livré : `proxmox.start` / `proxmox.shutdown` / `proxmox.reboot` sur QEMU et LXC
via `POST /api2/json/nodes/{node}/{qemu|lxc}/{vmid}/status/{start|shutdown|reboot}`.
GET `status/current` pour l'idempotence. Pas de force stop, destroy, snapshot,
migration, clone, console ni config update.

## 21.3 qBittorrent pause / resume

Livré : `qbittorrent.pause` / `qbittorrent.resume` sur des hashs explicites
(1–8, hex 40 ou 64). `POST /api/v2/torrents/stop` et `/start` (WebUI v5) avec
repli `/pause` et `/resume` (v4) si 404. Hashes dans le corps form-urlencoded,
jamais en query, jamais `all`. Widget `qbittorrent-transfer` inchangé (lecture
seule). Pas de delete, add, recheck, rename, preferences.

## 21.4 ntfy publish

Livré : `ntfy.publish` via `POST /{topic}` (topic `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`,
pas de réservés `v1`/`metrics`/…). Message ≤ 4096, titre ≤ 120, priorité enum
`min|low|default|high|max`, tags ≤ 5. Headers allowlistés uniquement. Pas
d'Actions HTTP, Click, Attach, Email, Delay. Audit : topic, priorité,
`messageLength` — jamais le corps.

## 21.5 Sonarr / Radarr / Prowlarr

Livré Sonarr : `RefreshSeries` (seriesId requis) et `EpisodeSearch` (un
episodeId) via `POST /api/v3/command`. Permission `sonarr.command`. Audit :
`sonarr.refresh-series` / `sonarr.search-episode`.

Livré Radarr : `RefreshMovie` et `MoviesSearch` avec un seul `movieId`.
Permission `radarr.command`. Audit : `radarr.refresh-movie` /
`radarr.search-movie`.

Rejeté : SeriesSearch, SeasonSearch, RssSync, DownloadedEpisodesScan, rename,
delete series/movie, settings, commandes globales sans ID.

Prowlarr : **reste read-only**. Les mutations officielles (CRUD indexeurs,
`/api/v1/search`, `RssSync`, test-all) ne sont ni ciblées, ni non destructives
de façon utile pour le dashboard. Pas de mutation forcée.
