# 15 — UI / UX

## 1. Identité

Créer une identité originale.

Ne pas reproduire visuellement Homarr pixel pour pixel.

## 2. Style

- dark-first ;
- clair disponible ;
- dense mais lisible ;
- animation discrète ;
- surfaces cohérentes ;
- navigation rapide.

## 3. Shell admin

Desktop :

```text
┌───────────────────────────────────────────────────┐
│ Top bar: recherche, alertes, profil              │
├──────────────┬────────────────────────────────────┤
│ Sidebar      │ Contenu                            │
│ Boards       │                                    │
│ Apps         │                                    │
│ Integrations │                                    │
│ Monitoring   │                                    │
│ Users        │                                    │
│ Settings     │                                    │
└──────────────┴────────────────────────────────────┘
```

## 4. Board

En lecture :

- chrome minimal ;
- widgets ;
- header optionnel.

En édition :

- grid visible ;
- toolbar ;
- catalogue widgets ;
- panneau propriétés.

## 5. Widget card

Structure :

- header facultatif ;
- status ;
- body ;
- footer facultatif ;
- menu edit uniquement mode édition.

## 6. Responsive

Ne pas simplement écraser le desktop en une colonne.

Utiliser layouts mobiles persistés.

## 7. Loading

Préférer skeletons stables.

Éviter layout shift.

## 8. Erreurs

Exemple widget :

```text
Jellyfin
Connexion impossible
Timeout après 8 s
[Réessayer]
```

Pas :

```text
Something went wrong
```

## 9. État non configuré

Doit être distinct de panne.

```text
Intégration non configurée
[Configurer]
```

## 10. Permissions

Si un user n'a pas permission de configurer :

- ne pas afficher bouton inutilisable ;
- serveur protège quand même.

## 11. Accessibility

- clavier ;
- focus ;
- aria labels ;
- drag avec alternative clavier autant que possible ;
- contrastes WCAG raisonnables.

## 12. Icônes

Le catalogue Phase 7.5 / 7.6 affiche des icônes locales vendored (`/app-icons/<slug>.svg`) via `<img>`.
Les URL HTTP(S) existantes restent valides. Un fallback générique remplace une image cassée.
Aucun SVG n'est injecté en HTML.

`/apps` liste les Apps créées. `/apps/library` parcourt le catalogue : recherche, filtres
catégories, cards clavier, CTA « Application personnalisée ». Les définitions `active` sont
affichées par défaut. Un toggle « Afficher les applications anciennes » et la recherche
rendent les apps `legacy` / `retired` trouvables, avec badges texte « Legacy » / « Retiré »
et un lien « Remplacé par … » accessible au clavier. Un avertissement non bloquant apparaît
si l'utilisateur choisit un template ancien. Aucun badge online/status sur une définition.

## 13. Docker Phase 8

`/integrations` : carte nom/type/status/enabled. Bouton **Ouvrir** si `docker.read` (ou manage).
Modifier / Tester / Supprimer restent sur les permissions génériques.

Création/édition Docker : aide « Utilisez l'URL HTTP(S) interne de votre Docker Socket Proxy. »
Placeholder `http://socket-proxy:2375` sans `defaultValue`. Avertissement : accès daemon
hautement privilégié, proxy restreint, ne pas publier le port.

Création/édition Docker : champ optionnel « CA de confiance (PEM) », désactivé si
« Vérifier TLS » est décoché. Aide : coller uniquement le certificat CA public.

`/integrations/[id]` Docker s'ouvre pour un lecteur délégué (`integration.use` + `docker.read`)
via `docker.integration.get` : le titre est le nom réel, sans `integration.read` ni config.

`/integrations/[id]` (type `docker`) : header nom + sous-titre Docker ; version Engine et API
négociée réelles ; compteurs calculés depuis `listContainers` (total, running, exited,
restarting, paused). Liste desktop en table dense, mobile en cards : icône reconnue, nom,
image, state, status borné, ports sûrs, badge legacy/retired, lien Voir.

`/integrations/[id]/containers/[containerId]` : name, image, state, health, uptime,
restartCount, stats one-shot. Pas d'Env/Mounts/labels/command. Métrique `null` →
« Indisponible », jamais « 0 % » pour une valeur inconnue.

Logs : non chargés par défaut. Si `canLogs`, bouton **Charger les logs** (tail borné, pas de
follow/WebSocket/polling). Texte monospace escaped. Avertissement : les logs peuvent contenir
des informations sensibles.

Actions selon permissions serveur : Stop/Restart si running, Start si `created`/`exited`.
Confirmation obligatoire pour stop et restart (composant partagé). Start sans confirmation
obligatoire. Un échec start/stop/restart (proxy down, 403, rate limit) s'affiche dans une
alerte isolée des contrôles, sans error boundary Next.js.

Docker down : alerte isolée (DNS, timeout, TLS, forbidden, unavailable). Ne casse pas
`/integrations`, le dashboard ni Next.js. 403 proxy logs :
« L'accès aux logs n'est pas autorisé par le socket proxy. »

App reconnue : lien « Ajouter aux applications » vers `/apps/new?template=<id>` sans URL
préremplie.

## 14. Search/Spotlight

Phase 1.5 :

`Ctrl+K` / `Cmd+K`.

Résultats :

- apps ;
- boards ;
- actions autorisées.
