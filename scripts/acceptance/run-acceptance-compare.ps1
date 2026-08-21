param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$comparisonDir = Join-Path $p.Docs "comparison"
Ensure-Dir $comparisonDir
$round = (Get-ChildItem -LiteralPath $comparisonDir -Filter "round-*.json" -ErrorAction SilentlyContinue | Measure-Object).Count + 1
$roundId = "round-$('{0:D3}' -f $round)"
$roundJson = Join-Path $comparisonDir "$roundId.json"
$roundMd = Join-Path $comparisonDir "$roundId.md"
$loopDoc = Join-Path $p.Docs "18-acceptance-comparison-loop.md"
if (!(Test-Path -LiteralPath $loopDoc)) {
  "# Acceptance Comparison Loop`n`n| Round | Result | Requirement alignment | UI alignment | Contract alignment | Test evidence | Remaining gaps | Next action | Evidence |`n|---|---|---|---|---|---|---|---|`n" | Set-Content -Encoding UTF8 $loopDoc
}

$docsToCheck = @(
  @{ kind="requirements"; path=Join-Path $p.Docs "02-requirement-traceability-matrix.md" },
  @{ kind="stories"; path=Join-Path $p.Docs "03-story-map.md" },
  @{ kind="storyTests"; path=Join-Path $p.Docs "04-story-test-matrix.md" },
  @{ kind="ui"; path=Join-Path $p.Docs "04-visual-acceptance-checklist.md" },
  @{ kind="surface"; path=Join-Path $p.Docs "03-surface-map.md" },
  @{ kind="contract"; path=Join-Path $p.Docs "04-contract-map.md" },
  @{ kind="frontendPlan"; path=Join-Path $p.Docs "14-frontend-implementation-plan.md" },
  @{ kind="backendPlan"; path=Join-Path $p.Docs "15-backend-implementation-plan.md" },
  @{ kind="integratedPlan"; path=Join-Path $p.Docs "16-integrated-verification-plan.md" },
  @{ kind="finalChecklist"; path=Join-Path $p.Docs "17-final-acceptance-checklist.md" }
)

$hardGapPatterns = @(
  "\bnot started\b",
  "\bTODO\b",
  "\bTBD\b",
  "\bHARD_FAIL\b",
  "\bIN_SCOPE_GAP\b",
  "- \[ \]"
)
$limitationPatterns = @(
  "\bPASS_WITH_LIMITATION\b",
  "\bDOCUMENTED_BLOCKER\b",
  "\bBLOCKED_BY_ENVIRONMENT\b",
  "\bMANUAL_REVIEW_REQUIRED\b",
  "\bPRODUCT_DECISION_REQUIRED\b",
  "\bDEFERRED\b"
)

$gaps = @()
$limitations = @()
foreach ($doc in $docsToCheck) {
  if (!(Test-Path -LiteralPath $doc.path)) {
    $gaps += @{ kind=$doc.kind; severity="HARD_FAIL"; detail="Missing required evidence file"; path=Get-RelativeEvidencePath $ProjectRoot $doc.path }
    continue
  }
  try { $text = Get-Content -LiteralPath $doc.path -Raw -ErrorAction Stop } catch { $text = "" }
  if ([string]::IsNullOrWhiteSpace($text)) {
    $gaps += @{ kind=$doc.kind; severity="HARD_FAIL"; detail="Evidence file is empty"; path=Get-RelativeEvidencePath $ProjectRoot $doc.path }
    continue
  }
  foreach ($pattern in $hardGapPatterns) {
    if ($text -match $pattern) {
      $gaps += @{ kind=$doc.kind; severity="IN_SCOPE_GAP"; detail="Hard pattern found: $pattern"; path=Get-RelativeEvidencePath $ProjectRoot $doc.path }
      break
    }
  }
  foreach ($pattern in $limitationPatterns) {
    if ($text -match $pattern) {
      $limitations += @{ kind=$doc.kind; severity="PASS_WITH_LIMITATION"; detail="Limitation/status pattern found: $pattern"; path=Get-RelativeEvidencePath $ProjectRoot $doc.path }
      break
    }
  }
}

try { $gapList = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json } catch { $gapList = $null }
if ($null -ne $gapList -and $null -ne $gapList.gaps) {
  foreach ($gap in @($gapList.gaps | Where-Object { $_.severity -in @("HARD_FAIL","IN_SCOPE_GAP") -and $_.status -ne "CLOSED" })) {
    $gaps += @{
      kind = if (![string]::IsNullOrWhiteSpace([string]$gap.type)) { [string]$gap.type } else { "gap-list" }
      severity = [string]$gap.severity
      detail = if (![string]::IsNullOrWhiteSpace([string]$gap.description)) { [string]$gap.description } else { [string]$gap.id }
      path = Get-RelativeEvidencePath $ProjectRoot $p.GapListJson
    }
  }
}

$threshold = [double](Get-HarnessConfigValue $ProjectRoot "visual" "diffThreshold" "0.03")
try { $uiVerifier = Get-Content -LiteralPath (Join-Path $p.Results "ui-verifier.json") -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $uiVerifier = $null }
try { $uiPixelDiff = Get-Content -LiteralPath (Join-Path $p.Results "ui-pixel-diff.json") -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $uiPixelDiff = $null }
try { $requirementTarget = Get-Content -LiteralPath $p.RequirementTarget -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $requirementTarget = $null }
try { $storyTarget = Get-Content -LiteralPath $p.StoryTarget -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $storyTarget = $null }

if ($null -ne $uiPixelDiff -and $null -ne $uiPixelDiff.comparisons) {
  foreach ($comparison in @($uiPixelDiff.comparisons)) {
    $ratio = $null
    try {
      if (![string]::IsNullOrWhiteSpace([string]$comparison.ratio)) { $ratio = [double]$comparison.ratio }
    } catch { $ratio = $null }
    $sizeMismatch = ($comparison.sizeMismatch -eq $true)
    if (($null -ne $ratio -and $ratio -gt $threshold) -or $sizeMismatch -or ((Normalize-AEVerdict $comparison.status) -in @("HARD_FAIL","FAIL","IN_SCOPE_GAP"))) {
      $gaps += @{
        kind = "ui-pixel-diff"
        severity = $(if ((Normalize-AEVerdict $comparison.status) -in @("HARD_FAIL","FAIL")) { "HARD_FAIL" } else { "IN_SCOPE_GAP" })
        detail = "UI screen $($comparison.id) exceeds fidelity gate: ratio=$ratio threshold=$threshold sizeMismatch=$sizeMismatch status=$($comparison.status)"
        path = "docs/auto-execute/results/ui-pixel-diff.json"
      }
    }
  }
} elseif ($null -ne $uiVerifier) {
  $limitations += @{ kind="ui-pixel-diff"; severity="PASS_WITH_LIMITATION"; detail="ui-verifier exists but ui-pixel-diff.json is missing"; path="docs/auto-execute/results/ui-verifier.json" }
}

if ($null -ne $uiVerifier -and $null -ne $uiVerifier.screens) {
  foreach ($screen in @($uiVerifier.screens)) {
    $finalUiStatus = Normalize-AEVerdict $screen.finalUiStatus
    if ($finalUiStatus -in @("HARD_FAIL","FAIL","IN_SCOPE_GAP")) {
      $gaps += @{ kind="ui-verifier"; severity="HARD_FAIL"; detail="Required UI screen $($screen.id) finalUiStatus=$finalUiStatus"; path="docs/auto-execute/results/ui-verifier.json" }
    }
  }
}

if ($null -ne $requirementTarget -and $null -ne $requirementTarget.requirements) {
  foreach ($req in @($requirementTarget.requirements)) {
    $reqStatus = Normalize-AEVerdict $req.status
    if ($reqStatus -in @("HARD_FAIL","FAIL","IN_SCOPE_GAP") -or $req.normalized -eq $false) {
      $gaps += @{ kind="requirement-target"; severity="IN_SCOPE_GAP"; detail="Requirement $($req.id) is not acceptance-ready: status=$($req.status) normalized=$($req.normalized)"; path=Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget }
    }
  }
}

if ($null -ne $storyTarget -and $null -ne $storyTarget.stories) {
  foreach ($story in @($storyTarget.stories)) {
    $storyStatus = Normalize-AEVerdict $story.status
    $missingAcceptance = ($null -eq $story.acceptanceCriteria -or @($story.acceptanceCriteria).Count -eq 0)
    $missingTests = ($null -eq $story.testPoints -or @($story.testPoints).Count -eq 0)
    if ($storyStatus -in @("HARD_FAIL","FAIL","IN_SCOPE_GAP") -or $story.normalized -eq $false -or $missingAcceptance -or $missingTests) {
      $gaps += @{ kind="story-target"; severity="IN_SCOPE_GAP"; detail="Story $($story.id) is not acceptance-ready: status=$($story.status) normalized=$($story.normalized) acceptanceMissing=$missingAcceptance testsMissing=$missingTests"; path=Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget }
    }
  }
}

$status = if ($gaps.Count -gt 0) { "HARD_FAIL" } elseif ($limitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" }
$nextAction = if ($status -eq "PASS") {
  "No unresolved comparison gaps detected. Proceed to code review/final report."
} elseif ($status -eq "PASS_WITH_LIMITATION") {
  "No hard comparison gaps detected. Preserve limitations in final report; do not claim pure PASS or pixel-perfect completion."
} else {
  "Use this comparison round as the next repair input, update implementation/evidence, then run another comparison round."
}

$result = @{
  schemaVersion = $AE_SCHEMA_VERSION
  lane = "acceptance-compare"
  round = $round
  status = $status
  generatedAt = (Get-Date).ToString("s")
  compared = $docsToCheck | ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.path }
  gaps = $gaps
  limitations = $limitations
  nextActions = @($nextAction)
}
$result | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $roundJson

@(
  "# Acceptance Comparison $roundId",
  "",
  "Generated: $(Get-Date)",
  "",
  "- Status: $status",
  "- Next action: $nextAction",
  "",
  "## Gaps",
  $(if ($gaps.Count -gt 0) { $gaps | ForEach-Object { "- [$($_.severity)] $($_.kind): $($_.detail) ($($_.path))" } } else { "- None detected" }),
  "",
  "## Limitations",
  $(if ($limitations.Count -gt 0) { $limitations | ForEach-Object { "- [$($_.severity)] $($_.kind): $($_.detail) ($($_.path))" } } else { "- None detected" })
) | Set-Content -Encoding UTF8 $roundMd

Add-Content -Encoding UTF8 $loopDoc "| $roundId | $status | $(if($gaps.kind -contains 'requirements' -or $gaps.kind -contains 'stories' -or $gaps.kind -contains 'storyTests'){'gap'}else{'ok'}) | $(if($gaps.kind -contains 'ui'){'gap'}else{'ok'}) | $(if($gaps.kind -contains 'contract'){'gap'}else{'ok'}) | $(if($gaps.kind -contains 'verification'){'gap'}else{'ok'}) | $($gaps.Count) gaps / $($limitations.Count) limitations | $nextAction | $(Get-RelativeEvidencePath $ProjectRoot $roundJson) |"
Add-EvidenceItem $ProjectRoot "other" $roundJson "acceptance comparison $roundId"
Add-EvidenceItem $ProjectRoot "other" $roundMd "acceptance comparison $roundId report"
Write-LaneResult $ProjectRoot "acceptance-compare" $status @() @((Get-RelativeEvidencePath $ProjectRoot $roundJson),(Get-RelativeEvidencePath $ProjectRoot $roundMd)) $gaps @($nextAction)
Add-VerificationResult $ProjectRoot "acceptance-compare" $status "Comparison $roundId found $($gaps.Count) hard gap(s), $($limitations.Count) limitation(s)" $roundJson

if ($status -eq "PASS") { Write-Host "[PASS] acceptance-compare $roundId" }
elseif ($status -eq "PASS_WITH_LIMITATION") { Write-Host "[PASS_WITH_LIMITATION] acceptance-compare $roundId found $($limitations.Count) limitation(s)" }
else { Write-Host "ERROR: acceptance-compare $roundId found $($gaps.Count) hard gap(s)" }
