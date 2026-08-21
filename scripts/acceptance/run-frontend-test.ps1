param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast", [string]$FrontendDir = "")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot

try {
  $args = @("-ExecutionPolicy","Bypass","-File",(Join-Path $PSScriptRoot "run-frontend.ps1"),"-ProjectRoot",$ProjectRoot,"-Mode",$Mode)
  if (![string]::IsNullOrWhiteSpace($FrontendDir)) { $args += @("-FrontendDir",$FrontendDir) }
  & powershell @args
} catch {
  Add-VerificationResult $ProjectRoot "frontend-test" "HARD_FAIL" $_.Exception.Message ""
}

$p = Get-AEPaths $ProjectRoot
$frontendPath = Join-Path $p.Results "frontend.json"
try {
  if (Test-Path -LiteralPath $frontendPath) { $frontend = Get-Content -LiteralPath $frontendPath -Raw -ErrorAction Stop | ConvertFrom-Json }
  else { $frontend = $null }
} catch { $frontend = $null }
$status = if ($null -ne $frontend) { Normalize-AEVerdict $frontend.status } else { "HARD_FAIL" }
$commands = if ($null -ne $frontend) { @($frontend.commands) } else { @() }
$blockers = if ($null -ne $frontend) { @($frontend.blockers) } else { @("frontend.json missing or invalid") }
Write-LaneResult $ProjectRoot "frontend-test" $status $commands @("docs/auto-execute/logs") $blockers @("Repair frontend lint/typecheck/test/build failures and rerun run-frontend-test.ps1.")
Add-VerificationResult $ProjectRoot "frontend-test" $status "Frontend test verifier mirrored frontend lane status $status" (Join-Path $p.Results "frontend-test.json")
Write-Host "[$status] frontend-test"
