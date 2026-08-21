param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

try { $scorecard = Get-Content -LiteralPath $p.HarnessScorecard -Raw | ConvertFrom-Json } catch { $scorecard = $null }
try { $gapList = Get-Content -LiteralPath $p.HarnessGapList -Raw | ConvertFrom-Json } catch { $gapList = $null }
$score = if ($null -ne $scorecard -and $null -ne $scorecard.totalScore) { [int]$scorecard.totalScore } else { 0 }
$gaps = if ($null -ne $gapList -and $null -ne $gapList.gaps) { @($gapList.gaps) } else { @() }

$lines = @(
  "# Harness Repair Plan",
  "",
  "Generated: $(Get-Date)",
  "",
  "- Current score: $score/100",
  "- Target score: 90/100",
  "- Open harness gaps: $($gaps.Count)",
  "",
  "## Repair Loop",
  "",
  "1. Read `docs/auto-execute/harness-gap-list.json`.",
  "2. Patch the harness scripts or fixtures named by each gap.",
  "3. Rerun `run-harness-self-eval.ps1`.",
  "4. Rerun `run-harness-score.ps1`.",
  "5. Repeat up to 5 rounds or until score is at least 90.",
  "",
  "## Gaps",
  ""
)
if ($gaps.Count -eq 0) {
  $lines += "- No scorecard gaps are currently open."
} else {
  foreach ($gap in $gaps) {
    $lines += "### $($gap.id)"
    $lines += ""
    $lines += "- Category: $($gap.category)"
    $lines += "- Severity: $($gap.severity)"
    $lines += "- Issue: $($gap.issue)"
    $lines += "- Suggested repair: Improve the harness behavior for `$($gap.category)` and add or update a meta-test so the issue cannot silently regress."
    $lines += ""
  }
}
$lines | Set-Content -Encoding UTF8 $p.HarnessRepairPlan

Write-LaneResult $ProjectRoot "harness-gap-repair" $(if ($score -ge 90) { "PASS" } else { "PASS_WITH_LIMITATION" }) @() @(
  (Get-RelativeEvidencePath $ProjectRoot $p.HarnessRepairPlan),
  (Get-RelativeEvidencePath $ProjectRoot $p.HarnessGapList)
) $gaps @("Use harness-repair-plan.md as the next self-improvement checklist.")
Add-VerificationResult $ProjectRoot "harness-gap-repair" $(if ($score -ge 90) { "PASS" } else { "PASS_WITH_LIMITATION" }) "Harness repair plan generated for score $score/100" $p.HarnessRepairPlan
Write-Host "[PASS] harness-gap-repair: repair plan generated"
