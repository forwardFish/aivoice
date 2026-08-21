param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$TodoPath = ""
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if ([string]::IsNullOrWhiteSpace($TodoPath)) {
  $TodoPath = Join-Path $ProjectRoot "TODO.md"
} elseif (-not [System.IO.Path]::IsPathRooted($TodoPath)) {
  $TodoPath = Join-Path $ProjectRoot $TodoPath
}

$latestDir = Join-Path $p.Docs "latest"
$latestGapList = Join-Path $latestDir "gap-list.json"
$latestRepairPlan = Join-Path $latestDir "repair-plan.md"
$latestNextAction = Join-Path $latestDir "next-agent-action.md"

if (!(Test-Path -LiteralPath $latestGapList) -and (Test-Path -LiteralPath $p.GapListJson)) {
  Ensure-Dir $latestDir
  Copy-Item -LiteralPath $p.GapListJson -Destination $latestGapList -Force
}
if (!(Test-Path -LiteralPath $latestRepairPlan) -and (Test-Path -LiteralPath $p.RepairPlan)) {
  Ensure-Dir $latestDir
  Copy-Item -LiteralPath $p.RepairPlan -Destination $latestRepairPlan -Force
}
if (!(Test-Path -LiteralPath $latestNextAction) -and (Test-Path -LiteralPath $p.NextAgentAction)) {
  Ensure-Dir $latestDir
  Copy-Item -LiteralPath $p.NextAgentAction -Destination $latestNextAction -Force
}

try { $gapList = Get-Content -LiteralPath $latestGapList -Raw | ConvertFrom-Json } catch { $gapList = $null }
$openGaps = @()
if ($null -ne $gapList -and $null -ne $gapList.gaps) {
  $openGaps = @($gapList.gaps) | Where-Object { $_.severity -in @("HARD_FAIL","IN_SCOPE_GAP") -and $_.status -ne "CLOSED" }
}

function ConvertTo-TodoText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
  return (($Text -replace "`r", " ") -replace "`n", " ").Trim()
}

function Get-GapAllowedFiles($Gap) {
  $values = @()
  foreach ($name in @("allowedFiles","targetFiles","files","repairFiles")) {
    if ($null -ne $Gap.$name) { $values += @($Gap.$name) }
  }
  if ($values.Count -eq 0 -and ![string]::IsNullOrWhiteSpace([string]$Gap.repairTarget)) {
    $raw = [string]$Gap.repairTarget
    foreach ($piece in $raw.Split(",")) {
      $candidate = $piece.Trim()
      if ($candidate -match '^[A-Za-z0-9_\-./\\\[\]{}]+$') { $values += $candidate }
    }
  }
  $values = @($values | ForEach-Object { ConvertTo-TodoText ([string]$_) } | Where-Object { $_ } | Select-Object -Unique)
  if ($values.Count -eq 0) { return "Implementation, tests, and evidence files directly related to this gap." }
  return ($values -join ", ")
}

function Get-GapCommands($Gap) {
  $commands = @()
  foreach ($name in @("verificationCommands","commands","validationCommands","requiredCommands")) {
    if ($null -ne $Gap.$name) { $commands += @($Gap.$name) }
  }
  $commands = @($commands | ForEach-Object { ConvertTo-TodoText ([string]$_) } | Where-Object { $_ } | Select-Object -Unique)
  if ($commands.Count -eq 0) {
    $commands = @(
      "powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-convergence.ps1 -ProjectRoot `"$ProjectRoot`" -Mode gate -MaxRounds 5"
    )
  }
  return ($commands -join "; ")
}

function Get-GapEvidence($Gap) {
  $evidence = @()
  foreach ($name in @("evidence","evidencePath","evidenceOutput","resultPath")) {
    if ($null -ne $Gap.$name) { $evidence += @($Gap.$name) }
  }
  $evidence = @($evidence | ForEach-Object { ConvertTo-TodoText ([string]$_) } | Where-Object { $_ } | Select-Object -Unique)
  if ($evidence.Count -eq 0) { return "docs/auto-execute/latest/verification-results.md" }
  return ($evidence -join ", ")
}

$repairPlanText = if (Test-Path -LiteralPath $latestRepairPlan) { (Get-Content -LiteralPath $latestRepairPlan -Raw).Trim() } else { "No repair-plan.md found." }
$nextActionText = if (Test-Path -LiteralPath $latestNextAction) { (Get-Content -LiteralPath $latestNextAction -Raw).Trim() } else { "No next-agent-action.md found." }

$lines = @(
  "# TODO.md",
  "",
  "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
  "Source: docs/auto-execute/latest/gap-list.json",
  "",
  "## Execution Rules",
  "",
  "Each Worker may execute only the first unfinished task.",
  "After a task succeeds, change its checkbox to [x] and add modified files, commands, verification result, and evidence path.",
  "If a task cannot be completed safely, add a '## BLOCKED' section with the reason and stop.",
  "Do not use -ResetConvergence while resuming this run.",
  "",
  "## Task List",
  ""
)

if ($openGaps.Count -eq 0) {
  $lines += "- [x] No open HARD_FAIL or IN_SCOPE_GAP in latest gap-list.json."
} else {
  foreach ($gap in $openGaps) {
    $gapId = if (![string]::IsNullOrWhiteSpace([string]$gap.id)) { [string]$gap.id } else { "GAP-UNKNOWN" }
    $description = ConvertTo-TodoText ([string]$gap.description)
    if ([string]::IsNullOrWhiteSpace($description)) { $description = "Repair unresolved acceptance gap." }
    $type = if (![string]::IsNullOrWhiteSpace([string]$gap.type)) { [string]$gap.type } else { [string]$gap.severity }
    $target = ConvertTo-TodoText ([string]$gap.repairTarget)
    if ([string]::IsNullOrWhiteSpace($target)) { $target = "Repair implementation/tests/evidence so the gap closes in the next convergence round." }
    $lines += "- [ ] $gapId`: $description"
    $lines += "  - Type: $type"
    $lines += "  - Severity: $($gap.severity)"
    $lines += "  - Repair target: $target"
    $lines += "  - Allowed files: $(Get-GapAllowedFiles $gap)"
    $lines += "  - Required verification: $(Get-GapCommands $gap)"
    $lines += "  - Evidence: $(Get-GapEvidence $gap)"
    $lines += ""
  }
}

$lines += @(
  "",
  "## Repair Plan Snapshot",
  "",
  "~~~markdown",
  $repairPlanText,
  "~~~",
  "",
  "## Next Agent Action Snapshot",
  "",
  "~~~markdown",
  $nextActionText,
  "~~~"
)

Ensure-Dir (Split-Path -Parent $TodoPath)
$lines | Set-Content -Encoding UTF8 $TodoPath
Write-LaneResult $ProjectRoot "todo-export" $(if ($openGaps.Count -eq 0) { "PASS" } else { "REPAIR_REQUIRED" }) @() @((Get-RelativeEvidencePath $ProjectRoot $TodoPath)) @() @("Run run-codex-supervisor.ps1 or repair the first TODO item manually.")
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "todo exported from gaps" | Out-Null
Write-Host "[PASS] TODO exported: $TodoPath"
exit 0
