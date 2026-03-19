# switch-env.ps1 — przełącza środowisko dev
# Użycie: .\switch-env.ps1 prod | staging

param([Parameter(Mandatory)][ValidateSet("prod","staging")] [string]$env)

$root = $PSScriptRoot
$target = "$root\.env.local"

switch ($env) {
    "prod"    { Copy-Item "$root\.env.prod"    $target -Force; Write-Host "✓ Switched to PROD" -ForegroundColor Green }
    "staging" { Copy-Item "$root\.env.staging" $target -Force; Write-Host "✓ Switched to STAGING" -ForegroundColor Yellow }
}

# Pokaż aktywny Supabase URL
$url = (Get-Content $target | Where-Object { $_ -match "^NEXT_PUBLIC_SUPABASE_URL" }) -replace ".*=",""
Write-Host "  Supabase: $url" -ForegroundColor Cyan
