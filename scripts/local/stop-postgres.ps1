param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

$ErrorActionPreference = 'Stop'
$pgCtl = 'C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe'
$data = Join-Path $ProjectRoot '.runtime\postgres-data'
if (!(Test-Path -LiteralPath $data)) { exit 0 }
& $pgCtl status -D $data *> $null
if ($LASTEXITCODE -eq 0) { & $pgCtl stop -D $data -m fast -w }
