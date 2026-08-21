param(
  [string]$ProjectRoot = (Get-Location).Path,
  [ValidateSet("fast","gate","full")] [string]$Mode = "gate",
  [int]$MaxRounds = 5,
  [switch]$ResetConvergence,
  [switch]$Strict,
  [switch]$UseCodexSupervisor
)
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$previousOpenGaps = @()
try {
  $previousGapList = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json
  if ($null -ne $previousGapList) {
    $previousOpenGaps = @($previousGapList.gaps) | Where-Object { $_.severity -in @("HARD_FAIL","IN_SCOPE_GAP") -and $_.status -ne "CLOSED" }
  }
} catch {}

if ($ResetConvergence) {
  Reset-ConvergenceState $ProjectRoot $MaxRounds
  try {
    $resetState = Get-Content -LiteralPath $p.ConvergenceState -Raw | ConvertFrom-Json
    $resetState | Add-Member -NotePropertyName strict -NotePropertyValue ([bool]$Strict) -Force
    $resetState | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState
  } catch {}
  $previousOpenGaps = @()
  Write-Host "Convergence state reset. Starting from round 1."
}

try { $state = Get-Content -LiteralPath $p.ConvergenceState -Raw | ConvertFrom-Json } catch { $state = $null }
$previousRound = 0
if ($null -ne $state -and $null -ne $state.currentRound) { $previousRound = [int]$state.currentRound }

if ($previousRound -ge $MaxRounds) {
  @{
    status = "FAILED_TO_CONVERGE"
    currentRound = $previousRound
    maxRounds = $MaxRounds
    strict = [bool]$Strict
    finalVerdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
    updatedAt = (Get-Date).ToString("s")
  } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState
  $finalGateArgs = @("-ExecutionPolicy","Bypass","-File",(Join-Path $PSScriptRoot "run-final-gate.ps1"),"-ProjectRoot",$ProjectRoot,"-Mode",$Mode)
  if ($Strict) { $finalGateArgs += "-Strict" }
  & powershell @finalGateArgs
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "final gate completed after max rounds"
  Write-Host "FAIL: Acceptance did not converge within max rounds."
  exit 1
}

$round = $previousRound + 1
Write-Host "=== Acceptance Convergence Round $round/$MaxRounds ==="
@{
  status = "RUNNING"
  currentRound = $round
  maxRounds = $MaxRounds
  strict = [bool]$Strict
  updatedAt = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "convergence round $round started"

Reset-GapList $ProjectRoot $round
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-all.ps1") -ProjectRoot $ProjectRoot -Mode $Mode -SkipCompare -SkipFinalGate
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-requirement-section-map.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-requirement-coverage.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-requirement-verify.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-extract.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-curate.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-normalize.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-test-generate.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-test-materialize.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-generated-story-tests.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-quality-gate.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-verify.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-ui-capture.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
$uiCompareArgs = @("-ExecutionPolicy","Bypass","-File",(Join-Path $PSScriptRoot "run-ui-compare.ps1"),"-ProjectRoot",$ProjectRoot,"-Mode",$Mode)
if ($Strict) { $uiCompareArgs += "-Strict" }
& powershell @uiCompareArgs
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-contract-verify.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-e2e-flow.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-compare-requirements.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-compare-ui.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-acceptance-compare.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-story-final-report.ps1") -ProjectRoot $ProjectRoot -Mode $Mode

try { $gapList = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json } catch { $gapList = $null }
$hardGaps = @()
if ($null -ne $gapList) {
  $hardGaps = @($gapList.gaps) | Where-Object { $_.severity -in @("HARD_FAIL","IN_SCOPE_GAP") -and $_.status -ne "CLOSED" }
}

$currentOpenIds = @($hardGaps | ForEach-Object { $_.id })
$closedGaps = @($previousOpenGaps) | Where-Object { $_.id -notin $currentOpenIds }
Add-GapClosureLog $ProjectRoot $closedGaps $round

$roundMd = Join-Path $p.ConvergenceRounds "round-$('{0:D3}' -f $round).md"
@(
  "# Convergence Round $round",
  "",
  "Generated: $(Get-Date)",
  "",
  "- Hard/in-scope gaps: $($hardGaps.Count)",
  "- Gap list: $(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)"
) | Set-Content -Encoding UTF8 $roundMd
Add-EvidenceItem $ProjectRoot "other" $roundMd "convergence round $round"

if ($hardGaps.Count -eq 0) {
  $finalGateArgs = @("-ExecutionPolicy","Bypass","-File",(Join-Path $PSScriptRoot "run-final-gate.ps1"),"-ProjectRoot",$ProjectRoot,"-Mode",$Mode)
  if ($Strict) { $finalGateArgs += "-Strict" }
  & powershell @finalGateArgs
  $finalExit = $LASTEXITCODE
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "final gate completed"
  try {
    $summary = Get-Content -LiteralPath $p.MachineSummary -Raw | ConvertFrom-Json
    $finalVerdict = Normalize-AEVerdict $summary.finalVerdict
  } catch {
    $finalVerdict = "HARD_FAIL"
    $finalExit = 1
  }
  Write-Host "$finalVerdict`: Acceptance convergence reached final gate."
  exit $(if ($null -ne $finalExit) { $finalExit } else { Get-AEExitCode $finalVerdict })
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-gap-repair.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "export-todo-from-gaps.ps1") -ProjectRoot $ProjectRoot
@{
  status = "REPAIR_REQUIRED"
  currentRound = $round
  maxRounds = $MaxRounds
  lastGapCount = $hardGaps.Count
  strict = [bool]$Strict
  repairPlan = Get-RelativeEvidencePath $ProjectRoot $p.RepairPlan
  nextAgentAction = Get-RelativeEvidencePath $ProjectRoot $p.NextAgentAction
  finalVerdict = "PENDING"
  updatedAt = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState
Set-MachineSummaryRepairRequired $ProjectRoot $hardGaps.Count $p.RepairPlan $p.NextAgentAction
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "REPAIR_REQUIRED after convergence round $round"
$supervisorEnabled = [bool]$UseCodexSupervisor
if (-not $supervisorEnabled) {
  $supervisorEnabled = Get-HarnessBoolValue $ProjectRoot "supervisor" "enabled" $false
}
if ($supervisorEnabled) {
  $maxWorkerRoundsRaw = Get-HarnessConfigValue $ProjectRoot "supervisor" "maxWorkerRounds" "20"
  $maxWorkerRounds = 20
  try { $maxWorkerRounds = [int]$maxWorkerRoundsRaw } catch {}
  Write-Host "REPAIR_REQUIRED: starting Codex supervisor worker loop."
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-codex-supervisor.ps1") -ProjectRoot $ProjectRoot -MaxWorkerRounds $maxWorkerRounds -Mode gate
  exit $LASTEXITCODE
}
Write-Host "REPAIR_REQUIRED: Agent must edit implementation/tests/evidence using repair-plan.md, then run convergence again."
exit 2
