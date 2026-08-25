# ADR 0002 — Dialectes, drivers et portabilité de la base

## Statut

Accepté pour la Phase 2.

## Décision

- SQLite local utilise `node:sqlite`, fourni par Node.js 24, sans addon natif tiers.
- Drizzle ORM stable 0.45.2 ne publie pas encore l'entrée `drizzle-orm/node-sqlite` présentée dans la
  documentation RC. Un adaptateur local minimal utilise donc l'entrée stable `sqlite-proxy` pour relier
  Drizzle au même `DatabaseSync`. Cela évite d'adopter Drizzle 1.0 RC.
- PostgreSQL utilise `pg` 8.16.3 et `drizzle-orm/node-postgres`.
- Les schémas SQLite et PostgreSQL sont séparés et leurs colonnes métier sont comparées par test.
- Les UUID sont générés côté application avec `crypto.randomUUID()`, stockés en `text` dans SQLite et
  en `uuid` dans PostgreSQL.
- Les timestamps sont des `Date` UTC : epoch millisecondes dans SQLite, `timestamp with time zone` dans
  PostgreSQL.
- Le JSON est du texte sérialisé dans SQLite et du `jsonb` dans PostgreSQL. La validation métier reste
  obligatoire avant repository.

## Migrations

Chaque dialecte possède son journal Drizzle Kit et ses migrations SQL versionnées. `generate` sert à
produire les changements et `migrate` à les appliquer ; `push` n'est pas un mécanisme de production.

## Conséquences

- aucun compilateur natif SQLite supplémentaire ;
- deux schémas plus explicites, au prix d'un test de parité obligatoire ;
- le passage futur au driver direct `node-sqlite` stable pourra retirer l'adaptateur sans modifier le
  modèle ou les repositories ;
- PostgreSQL doit être testé contre un serveur réel en CI.
