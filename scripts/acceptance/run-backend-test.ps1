param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast", [string]$BackendDir = "")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot

try {
  $args = @("-ExecutionPolicy","Bypass","-File",(Join-Path $PSScriptRoot "run-backend.ps1"),"-ProjectRoot",$ProjectRoot,"-Mode",$Mode)
  if (![string]::IsNullOrWhiteSpace($BackendDir)) { $args += @("-BackendDir",$BackendDir) }
  & powershell @args
} catch {
  Add-VerificationResult $ProjectRoot "backend-test" "HARD_FAIL" $_.Exception.Message ""
}

$p = Get-AEPaths $ProjectRoot
$backendPath = Join-Path $p.Results "backend.json"
try {
  if (Test-Path -LiteralPath $backendPath) { $backend = Get-Content -LiteralPath $backendPath -Raw -ErrorAction Stop | ConvertFrom-Json }
  else { $backend = $null }
} catch { $backend = $null }
$status = if ($null -ne $backend) { Normalize-AEVerdict $backend.status } else { "HARD_FAIL" }
$commands = if ($null -ne $backend) { @($backend.commands) } else { @() }
$blockers = if ($null -ne $backend) { @($backend.blockers) } else { @("backend.json missing or invalid") }
Write-LaneResult $ProjectRoot "backend-test" $status $commands @("docs/auto-execute/logs") $blockers @("Repair backend build/unit/integration/API smoke failures and rerun run-backend-test.ps1.")
Add-VerificationResult $ProjectRoot "backend-test" $status "Backend test verifier mirrored backend lane status $status" (Join-Path $p.Results "backend-test.json")
Write-Host "[$status] backend-test"
