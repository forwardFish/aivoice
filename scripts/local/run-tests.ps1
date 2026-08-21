param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$databaseUrl = & (Join-Path $PSScriptRoot 'start-postgres.ps1') -ProjectRoot $ProjectRoot -DatabaseName 'aivoice_test'
$env:DATABASE_URL = $databaseUrl | Select-Object -Last 1
Push-Location $ProjectRoot
try {
  npm run db:migrate
  if ($LASTEXITCODE -ne 0) { throw 'database migration failed' }
  npm run test:workspace
  if ($LASTEXITCODE -ne 0) { throw 'tests failed' }
} finally {
  Pop-Location
}
