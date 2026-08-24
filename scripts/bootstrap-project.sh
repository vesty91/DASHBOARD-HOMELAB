#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "=== Homelab Dashboard bootstrap ==="

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
NODE_VERSION="$(node -p 'process.versions.node')"

if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "Node.js $NODE_VERSION détecté."
  echo "Le starter demande Node.js 24+."
  exit 1
fi

corepack enable
corepack prepare pnpm@11.23.0 --activate

echo
echo "IMPORTANT: vérifier la dernière release sécurité Next.js 16.3 avant le lockfile."
echo "Version déclarée dans ce snapshot : 16.3.2 (24/08/2026)."
echo

pnpm install

if [ ! -d .git ]; then
  git init
  git add .
  git commit -m "chore: bootstrap homelab dashboard"
fi

pnpm lint
pnpm typecheck
pnpm test
pnpm build

echo
echo "Bootstrap terminé."
echo "Donne maintenant PROMPT-CODEX-FIRST-RUN.md à Codex."
