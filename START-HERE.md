# START HERE

Ce dépôt contient déjà :

- le pack complet de documentation Codex ;
- l'architecture de répertoires ;
- les manifests de workspace ;
- une application Next.js minimale ;
- les packages métier sous forme de frontières vides ;
- scripts d'initialisation ;
- configuration de base TypeScript / lint / format / tests.

## Important — Next.js

Le starter a été préparé le 24 août 2026 avec `next@16.3.2`.

Une release de sécurité Next.js 16.3 est annoncée pour le 26 août 2026.

Avant de créer le `pnpm-lock.yaml` définitif, Codex doit vérifier la dernière version de sécurité de la branche choisie et mettre à niveau si nécessaire.

## Première commande recommandée sous Windows

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\bootstrap-project.ps1
```

Puis donner à Codex :

```text
PROMPT-CODEX-FIRST-RUN.md
```

## Ce que Codex doit faire ensuite

Il doit considérer le code présent comme un **bootstrap**, pas comme une Phase 1 validée.

Il doit :

1. lire toute la documentation ;
2. auditer ce starter ;
3. corriger les incompatibilités de versions ;
4. installer les dépendances ;
5. générer le lockfile ;
6. compléter la configuration ;
7. exécuter lint/typecheck/test/build ;
8. ne passer à la DB qu'une fois les gates vertes.
