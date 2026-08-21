param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$selfEvalPath = Join-Path $p.Results "harness-self-eval.json"
if (!(Test-Path -LiteralPath $selfEvalPath)) {
  try { & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-harness-self-eval.ps1") -ProjectRoot $ProjectRoot -Mode $Mode | Out-Null } catch {}
}
try { $selfEval = Get-Content -LiteralPath $selfEvalPath -Raw | ConvertFrom-Json } catch { $selfEval = $null }
$tests = if ($null -ne $selfEval -and $null -ne $selfEval.tests) { @($selfEval.tests) } else { @() }

function Test-SelfEval($NamePattern) {
  $match = @($tests | Where-Object { $_.name -match $NamePattern } | Select-Object -First 1)
  return ($null -ne $match -and $match.passed -eq $true)
}

function New-Category($Score, $Max, $Issues) {
  [PSCustomObject]@{ score=[int]$Score; max=[int]$Max; issues=@($Issues) }
}

$categories = [ordered]@{}
$issues = @()
$score = 0
if (Test-SelfEval "requirement candidates") { $score = 15 } else { $score = 8; $issues += "Simple PRD did not generate expected requirement candidates." }
$categories["requirementExtraction"] = New-Category $score 15 $issues

$issues = @()
$score = 0
if ((Test-SelfEval "story candidates") -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-story-curate.ps1")) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-story-normalize.ps1"))) { $score = 15 } else { $score = 9; $issues += "Story extraction/curation/normalization meta checks are incomplete." }
$categories["storyNormalization"] = New-Category $score 15 $issues

$issues = @()
$score = 0
if ((Test-SelfEval "materialize") -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-story-test-generate.ps1"))) { $score = 20 } else { $score = 11; $issues += "Story test points were not fully generated and materialized." }
$categories["storyTestMaterialization"] = New-Category $score 20 $issues

$issues = @()
$score = 0
if ((Test-SelfEval "Bad requirement") -and (Test-SelfEval "Bad story") -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-story-final-report.ps1"))) { $score = 19 } else { $score = 10; $issues += "Evidence/failure meta-tests did not all fail closed." }
$categories["evidenceExecution"] = New-Category $score 20 $issues

$issues = @()
$score = 0
if (Test-SelfEval "Bad UI") { $score = 15 } else { $score = 7; $issues += "Bad UI missing screenshot did not fail the UI verifier." }
$categories["uiVerification"] = New-Category $score 15 $issues

$issues = @()
$score = 0
if ((Test-SelfEval "strict semantics") -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-final-gate.ps1")) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-convergence.ps1"))) { $score = 10 } else { $score = 5; $issues += "Final gate strict/pass-with-limitation semantics are incomplete." }
$categories["finalGateConsistency"] = New-Category $score 10 $issues

$issues = @()
$score = 0
if ((Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-secret-guard.ps1")) -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot "run-report-integrity.ps1")) -and (Test-Path -LiteralPath $p.HarnessSelfEvalReport)) { $score = 5 } else { $score = 2; $issues += "Safety/report integrity files are missing." }
$categories["safetyAndReportIntegrity"] = New-Category $score 5 $issues

$total = 0
foreach ($property in $categories.Keys) { $total += [int]$categories[$property].score }
$verdict = if ($total -ge 90) { "READY_FOR_FORMAL_PROJECTS" } elseif ($total -ge 80) { "GOOD_BUT_NEEDS_IMPROVEMENT" } elseif ($total -ge 70) { "TRIAL_ONLY_NOT_FOR_DELIVERY" } elseif ($total -ge 60) { "DETECTION_ONLY" } else { "HARNESS_UNRELIABLE" }

$gapItems = @()
foreach ($property in $categories.Keys) {
  $cat = $categories[$property]
  foreach ($issue in @($cat.issues)) {
    $gapItems += [PSCustomObject]@{
      id = "HARNESS-GAP-$($property.ToUpperInvariant())-$($gapItems.Count + 1)"
      category = $property
      severity = $(if ($total -lt 90) { "IN_SCOPE_GAP" } else { "DOCUMENTED" })
      issue = $issue
      score = $cat.score
      max = $cat.max
      status = "OPEN"
    }
  }
}

@{
  schemaVersion=$AE_SCHEMA_VERSION
  totalScore=$total
  categories=$categories
  verdict=$verdict
  generatedAt=(Get-Date).ToString("s")
  scoreMeaning=@{
    "90-100"="can be used as a formal project harness"
    "80-89"="usable on real projects, but gaps need attention"
    "70-79"="trial runs only, not recommended for delivery"
    "60-69"="detection only, not suitable for auto-repair"
    "<60"="harness itself is unreliable"
  }
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.HarnessScorecard

@{
  schemaVersion=$AE_SCHEMA_VERSION
  generatedAt=(Get-Date).ToString("s")
  score=$total
  threshold=90
  gaps=$gapItems
} | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $p.HarnessGapList

if ($total -lt 90) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-harness-gap-repair.ps1") -ProjectRoot $ProjectRoot -Mode $Mode | Out-Null
} elseif (!(Test-Path -LiteralPath $p.HarnessRepairPlan)) {
  "# Harness Repair Plan`n`nScore is $total. No mandatory repair plan is required.`n" | Set-Content -Encoding UTF8 $p.HarnessRepairPlan
}

Write-LaneResult $ProjectRoot "harness-score" $(if ($total -ge 90) { "PASS" } else { "PASS_WITH_LIMITATION" }) @() @(
  (Get-RelativeEvidencePath $ProjectRoot $p.HarnessScorecard),
  (Get-RelativeEvidencePath $ProjectRoot $p.HarnessGapList),
  (Get-RelativeEvidencePath $ProjectRoot $p.HarnessRepairPlan)
) $gapItems @("Repair harness gaps if totalScore is below 90.")
Add-VerificationResult $ProjectRoot "harness-score" $(if ($total -ge 90) { "PASS" } else { "PASS_WITH_LIMITATION" }) "Harness score $total/100 ($verdict)" $p.HarnessScorecard
Write-Host "[SCORE] harness-score: $total/100 $verdict"
exit $(if ($total -ge 90) { 0 } else { 3 })
