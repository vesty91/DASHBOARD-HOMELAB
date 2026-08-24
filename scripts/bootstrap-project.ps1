$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

Write-Host "=== Homelab Dashboard bootstrap ===" -ForegroundColor Cyan

$nodeVersionRaw = node -p "process.versions.node"
$major = [int]($nodeVersionRaw.Split(".")[0])

if ($major -lt 24) {
    Write-Host ""
    Write-Host "Node.js $nodeVersionRaw detecte." -ForegroundColor Yellow
    Write-Host "Le starter demande Node.js 24+." -ForegroundColor Yellow
    Write-Host "Mets Node a jour avant pnpm install, puis relance ce script."
    exit 1
}

Write-Host "Node.js $nodeVersionRaw : OK" -ForegroundColor Green

corepack enable
corepack prepare pnpm@11.23.0 --activate

Write-Host ""
Write-Host "IMPORTANT : verifier la derniere release securite Next.js 16.3 avant le lockfile." -ForegroundColor Yellow
Write-Host "Version declaree dans ce snapshot : 16.3.2 (24/08/2026)." -ForegroundColor Yellow
Write-Host ""

pnpm install

if (-not (Test-Path ".git")) {
    git init
    git add .
    git commit -m "chore: bootstrap homelab dashboard"
}

Write-Host ""
Write-Host "Execution des gates..." -ForegroundColor Cyan
pnpm lint
pnpm typecheck
pnpm test
pnpm build

Write-Host ""
Write-Host "Bootstrap termine." -ForegroundColor Green
Write-Host "Donne maintenant PROMPT-CODEX-FIRST-RUN.md a Codex."
