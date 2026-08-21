param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$out = Join-Path $p.Docs "FULL_FLOW_ACCEPTANCE.md"
Add-Content -Encoding UTF8 $out "`n## $(Get-Date)`nFull-flow smoke is project-specific. Populate 03-surface-map.md and implement flow tests where tooling exists.`n"
Add-VerificationResult $ProjectRoot "full-flow-smoke" "MANUAL_REVIEW_REQUIRED" "Project-specific full-flow test required" $out
Write-LaneResult $ProjectRoot "integration" "MANUAL_REVIEW_REQUIRED" @() @((Get-RelativeEvidencePath $ProjectRoot $out)) @("Project-specific full-flow test required") @("Implement E2E/smoke flow for P0/P1 requirements.")
Write-Host "[MANUAL_REVIEW_REQUIRED] full-flow-smoke"
