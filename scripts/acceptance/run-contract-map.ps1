param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

try {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-contract.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
} catch {
  Add-VerificationResult $ProjectRoot "contract-map" "HARD_FAIL" $_.Exception.Message ""
}

try { $map = Get-Content -LiteralPath $p.ContractMapJson -Raw | ConvertFrom-Json } catch { $map = $null }
$callCount = if ($null -ne $map -and $null -ne $map.frontendCalls) { @($map.frontendCalls).Count } else { 0 }
$apiCount = if ($null -ne $map -and $null -ne $map.apiDefinitions) { @($map.apiDefinitions).Count } else { 0 }
$status = if ($null -eq $map) { "HARD_FAIL" } elseif ($callCount -eq 0 -and $apiCount -eq 0) { "MANUAL_REVIEW_REQUIRED" } else { "PASS_WITH_LIMITATION" }
$blockers = if ($status -eq "PASS_WITH_LIMITATION") { @("Contract map discovery is not final verification; run run-contract-verify.ps1 after reconciling request/response/auth/error states.") } elseif ($status -eq "MANUAL_REVIEW_REQUIRED") { @("No frontend calls or API definitions auto-detected.") } else { @("contract-map.json missing or invalid.") }

Write-LaneResult $ProjectRoot "contract-map" $status @() @((Get-RelativeEvidencePath $ProjectRoot $p.ContractMapJson),(Get-RelativeEvidencePath $ProjectRoot (Join-Path $p.Docs "04-contract-map.md"))) $blockers @("Complete docs/auto-execute/contract-map.json or 04-contract-map.md, then run run-contract-verify.ps1.")
Add-VerificationResult $ProjectRoot "contract-map" $status "$callCount frontend call(s), $apiCount API definition(s)" $p.ContractMapJson
Write-Host "[$status] contract-map: $callCount frontend call(s), $apiCount API definition(s)"
