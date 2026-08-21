param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast", [string]$BackendDir = "")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if ($Mode -eq "fast") {
  Add-VerificationResult $ProjectRoot "db-e2e" "DEFERRED" "Skipped in fast mode" ""
  Write-LaneResult $ProjectRoot "db-e2e" "DEFERRED" @() @() @("Skipped in fast mode") @("Run -Mode gate or -Mode full with a safe local Postgres.")
  Write-Host "[DEFERRED] db-e2e fast mode"
  exit 0
}

$commands = @()
$blockers = @()
$nextActions = @()
$hardFail = $false

if ($env:DATABASE_BACKEND -and $env:DATABASE_BACKEND -ne "postgres") {
  $hardFail = $true
  $blockers += "DATABASE_BACKEND=$env:DATABASE_BACKEND; structured repository lane requires postgres. JSON-only cannot count as backend PASS."
}
$env:DATABASE_BACKEND = "postgres"

if ([string]::IsNullOrWhiteSpace($env:DATABASE_URL)) {
  $blockers += "DATABASE_URL is not configured; DB lane cannot prove PostgreSQL writes/reads."
  $hardFail = $true
} elseif (Test-UnsafeDatabaseUrl $env:DATABASE_URL) {
  Add-Blocker $ProjectRoot "db-e2e" "DOCUMENTED_BLOCKER" "DATABASE_URL looks unsafe"
  Write-LaneResult $ProjectRoot "db-e2e" "DOCUMENTED_BLOCKER" @() @() @("DATABASE_URL looks unsafe") @()
  Write-Host "[DOCUMENTED_BLOCKER] db-e2e unsafe DATABASE_URL"
  exit 0
}

$compose = Join-Path $ProjectRoot "docker\docker-compose.yml"
if (Test-Path -LiteralPath $compose) {
  if (!(Test-CommandExists "docker")) {
    $hardFail = $true
    $blockers += "Docker unavailable; cannot verify local Postgres service."
  } else {
    Push-Location $ProjectRoot
    try {
      $ok = Invoke-Gate $ProjectRoot "db:postgres-up" { docker compose -f $compose up -d postgres } "db-postgres-up.log"
      $commands += @{ command = "docker compose -f docker/docker-compose.yml up -d postgres"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/db-postgres-up.log" }
      if (-not $ok) { $hardFail = $true }
      $ok = Invoke-Gate $ProjectRoot "db:postgres-ps" { docker compose -f $compose ps postgres } "db-postgres-ps.log"
      $commands += @{ command = "docker compose -f docker/docker-compose.yml ps postgres"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/db-postgres-ps.log" }
      if (-not $ok) { $hardFail = $true }
    } finally { Pop-Location }
  }
}

$hasPythonStorage = (Test-Path -LiteralPath (Join-Path $ProjectRoot "packages\storage\migrations\bootstrap.py"))
$hasSnapshotRunner = (Test-Path -LiteralPath (Join-Path $ProjectRoot "tools\run_latest_snapshot.py"))
$hasLowPositionRunner = (Test-Path -LiteralPath (Join-Path $ProjectRoot "tools\run_low_position_workbench.py"))
$hasQueryBridge = (Test-Path -LiteralPath (Join-Path $ProjectRoot "tools\query_web_data.py"))

if ($hasPythonStorage -and $hasQueryBridge) {
  Push-Location $ProjectRoot
  try {
    $ok = Invoke-Gate $ProjectRoot "db:schema-bootstrap" { python -m packages.storage.migrations.bootstrap } "db-schema-bootstrap.log"
    $commands += @{ command = "python -m packages.storage.migrations.bootstrap"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/db-schema-bootstrap.log" }
    if (-not $ok) { $hardFail = $true }

    if ($hasSnapshotRunner) {
      $ok = Invoke-Gate $ProjectRoot "db:runtime-write-snapshot" { python tools/run_latest_snapshot.py --acceptance-smoke } "db-runtime-write-snapshot.log"
      $commands += @{ command = "python tools/run_latest_snapshot.py --acceptance-smoke"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/db-runtime-write-snapshot.log" }
      if (-not $ok) { $hardFail = $true }
    }
    if ($hasLowPositionRunner) {
      $ok = Invoke-Gate $ProjectRoot "db:runtime-write-low-position" { python tools/run_low_position_workbench.py --acceptance-smoke } "db-runtime-write-low-position.log"
      $commands += @{ command = "python tools/run_low_position_workbench.py --acceptance-smoke"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/db-runtime-write-low-position.log" }
      if (-not $ok) { $hardFail = $true }
    }
    $ok = Invoke-Gate $ProjectRoot "db:repository-read-snapshot" { python tools/query_web_data.py daily-snapshot } "db-repository-read-snapshot.log"
    $commands += @{ command = "python tools/query_web_data.py daily-snapshot"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/db-repository-read-snapshot.log" }
    if (-not $ok) { $hardFail = $true }
  } finally { Pop-Location }
} else {
  if ([string]::IsNullOrWhiteSpace($BackendDir)) { $BackendDir = Join-Path $ProjectRoot "backend" }
  $backendCompose = Join-Path $BackendDir "docker-compose.test.yml"
  if (!(Test-Path -LiteralPath $backendCompose)) {
    $hardFail = $true
    $blockers += "No Python storage bootstrap/query bridge or backend docker-compose.test.yml was found; DB lane cannot prove schema/runtime/API read path."
  } elseif (!(Test-CommandExists "docker")) {
    $hardFail = $true
    $blockers += "Docker unavailable; cannot verify backend DB E2E scripts."
  } else {
    Push-Location $BackendDir
    try {
      $scripts = Read-PackageScripts "package.json"
      foreach ($s in @("e2e:db:up","e2e:db:ps","e2e:db:push","e2e:db:seed","test:e2e:runtime:db","e2e:db:all")) {
        if ($scripts.ContainsKey($s)) {
          $logName = "db-$($s -replace ':','-').log"
          $ok = Invoke-Gate $ProjectRoot "db:$s" { npm run $s } $logName
          $commands += @{ command = "npm run $s"; status = $(if ($ok) { "PASS" } else { "HARD_FAIL" }); log = "docs/auto-execute/logs/$logName" }
          if (-not $ok) { $hardFail = $true }
        }
      }
      if ($commands.Count -eq 0) {
        $hardFail = $true
        $blockers += "No DB package scripts were found in backend package.json."
      }
    } finally { Pop-Location }
  }
}

$status = if ($hardFail) { "HARD_FAIL" } else { "PASS" }
if ($hardFail) {
  $nextActions += "Configure a safe local Postgres DATABASE_URL, start the local service, prove schema bootstrap, runtime write, and repository/API read checks."
} else {
  $nextActions += "DB lane is ready; run integrated API/UI smoke to prove the frontend renders repository-backed data."
}
Write-LaneResult $ProjectRoot "db-e2e" $status $commands @("docs/auto-execute/logs") $blockers $nextActions
Add-VerificationResult $ProjectRoot "db-e2e" $status "Postgres/schema/runtime write/repository read completed with status $status" (Join-Path $p.Results "db-e2e.json")
Write-Host "[$status] db-e2e"
exit (Get-AEExitCode $status)
