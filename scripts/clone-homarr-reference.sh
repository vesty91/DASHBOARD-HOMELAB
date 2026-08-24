#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFERENCE="$ROOT/reference"
TARGET="$REFERENCE/homarr"

mkdir -p "$REFERENCE"

if [ -e "$TARGET" ]; then
  echo "La référence existe déjà : $TARGET"
  echo "Suppression volontaire requise avant un nouveau clone."
  exit 0
fi

git clone --depth 1 --branch dev https://github.com/homarr-labs/homarr.git "$TARGET"

echo
echo "Référence Homarr clonée dans : $TARGET"
echo "Utiliser uniquement comme documentation / analyse."
