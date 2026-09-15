# ADR 0029 — Semver produit et release v1.0.0

## Statut

Accepté. Phase 19.

## Contexte

Jusqu’à la Phase 17, `APP_VERSION` et le `package.json` racine restaient `0.1.0`.
Les tags `phase-*` ne publient pas GHCR `latest`. Seuls les tags `vX.Y.Z`
publient les images (ADR 0019). Le propriétaire autorise explicitement la
première release stable `1.0.0` en Phase 19.

## Décisions

### 1. Version produit

La version produit est `1.0.0`. Elle apparaît dans :

- `package.json` racine ;
- repli `APP_VERSION` (health, Compose, Dockerfile, bake) ;
- `BACKUP_APP_VERSION` (métadonnée d’archive, pas un schéma).

Les `package.json` des workspaces internes restent à `0.1.0`.

### 2. Tags Git

- `phase-19-complete` et `v1.0.0` pointent le même commit de `main`.
  Les tags GHCR sont une liste HCL (`scripts/write-release-bake.mjs`) lue depuis
  le workspace (`bake-action` `source: .`), pas une chaîne CSV dans `set`.
- Un tag prerelease (`v1.0.1-rc.1`) publie uniquement `:tag` et `:sha-*`.
  Il ne déplace pas `latest`, `MAJOR` ni `MAJOR.MINOR`.

### 3. Compatibilité

Pas de migration `0007`. Un déploiement 0.1.0 schéma 6 se met à jour par
remplacement d’images. Rollback image possible tant que le schéma n’avance pas.
Pas de `migrate down`.

### 4. Hors scope

- Bump automatique des packages internes.
- Publication GHCR sur les tags `phase-*`.
