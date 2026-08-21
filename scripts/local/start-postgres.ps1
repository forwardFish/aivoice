param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path,
  [int]$Port = 54329,
  [string]$DatabaseName = 'aivoice'
)

$ErrorActionPreference = 'Stop'
if ($DatabaseName -notmatch '^[a-zA-Z][a-zA-Z0-9_]{0,62}$') {
  throw 'DatabaseName contains unsupported characters.'
}
$bin = 'C:\Program Files\PostgreSQL\16\bin'
$data = Join-Path $ProjectRoot '.runtime\postgres-data'
$log = Join-Path $ProjectRoot '.runtime\postgres-local.log'

if (!(Test-Path -LiteralPath (Join-Path $bin 'initdb.exe'))) {
  throw 'PostgreSQL 16 tools are not installed.'
}
if (!(Test-Path -LiteralPath $data)) {
  & (Join-Path $bin 'initdb.exe') -D $data -U aivoice -A trust --encoding=UTF8 --no-locale
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
}
& (Join-Path $bin 'pg_ctl.exe') status -D $data *> $null
if ($LASTEXITCODE -ne 0) {
  $arguments = "start -D `"$data`" -l `"$log`" -o `"-p $Port -h 127.0.0.1`" -w"
  $pgCtlOut = Join-Path $ProjectRoot '.runtime\pgctl-start.out.log'
  $pgCtlErr = Join-Path $ProjectRoot '.runtime\pgctl-start.err.log'
  $pgCtl = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') `
    -ArgumentList $arguments `
    -RedirectStandardOutput $pgCtlOut -RedirectStandardError $pgCtlErr `
    -WindowStyle Hidden -PassThru
  if (!$pgCtl.WaitForExit(15000)) {
    Stop-Process -Id $pgCtl.Id -Force -ErrorAction SilentlyContinue
    throw 'local PostgreSQL start timed out'
  }
  if ($pgCtl.ExitCode -ne 0) { throw 'local PostgreSQL start failed' }
}
$env:PGHOST = '127.0.0.1'
$env:PGPORT = [string]$Port
$env:PGUSER = 'aivoice'
$existsOutput = & (Join-Path $bin 'psql.exe') -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DatabaseName'"
$exists = [Convert]::ToString($existsOutput).Trim()
if ($exists -ne '1') { & (Join-Path $bin 'createdb.exe') $DatabaseName }
Write-Output "postgresql://aivoice@127.0.0.1:$Port/$DatabaseName"
