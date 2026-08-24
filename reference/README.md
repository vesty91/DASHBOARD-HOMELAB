# Références externes

Ce dossier ne doit pas contenir de code propriétaire au produit final.

Pour cloner Homarr comme référence documentaire locale :

- Windows : `..\scripts\clone-homarr-reference.ps1`
- Linux/macOS : `../scripts/clone-homarr-reference.sh`

Le sous-dossier `homarr/` doit être ignoré par Git dans le nouveau projet.

Recommandation `.gitignore` :

```gitignore
/reference/homarr/
```

Ne pas importer directement des fichiers depuis `reference/homarr` dans le build.
