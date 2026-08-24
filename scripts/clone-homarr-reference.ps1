$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Reference = Join-Path $Root "reference"
$Target = Join-Path $Reference "homarr"

New-Item -ItemType Directory -Force -Path $Reference | Out-Null

if (Test-Path $Target) {
    Write-Host "La référence existe déjà : $Target"
    Write-Host "Suppression volontaire requise avant un nouveau clone."
    exit 0
}

git clone --depth 1 --branch dev https://github.com/homarr-labs/homarr.git $Target

Write-Host ""
Write-Host "Référence Homarr clonée dans : $Target"
Write-Host "Utiliser uniquement comme documentation / analyse."
