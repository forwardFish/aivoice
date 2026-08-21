param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-verifier" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-verifier"
  exit 0
}

try { $target = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $candidates = Get-Content -LiteralPath $p.StoryCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
try { $matrix = Get-Content -LiteralPath $p.StoryTestMatrix -Raw | ConvertFrom-Json } catch { $matrix = $null }
$generatedStoryTestsPath = Join-Path $p.Results "generated-story-tests.json"
$e2eFlowResultPath = Join-Path $p.Results "e2e-flow.json"
try {
  if (Test-Path -LiteralPath $generatedStoryTestsPath) { $generatedStoryTests = Get-Content -LiteralPath $generatedStoryTestsPath -Raw -ErrorAction Stop | ConvertFrom-Json }
  else { $generatedStoryTests = $null }
} catch { $generatedStoryTests = $null }
try {
  if (Test-Path -LiteralPath $e2eFlowResultPath) { $e2eFlowResult = Get-Content -LiteralPath $e2eFlowResultPath -Raw -ErrorAction Stop | ConvertFrom-Json }
  else { $e2eFlowResult = $null }
} catch { $e2eFlowResult = $null }

$gaps = @()
$limitations = @()
$statuses = @()

function Add-StoryGap($Id, $Severity, $Description, $RepairTarget, $Source) {
  $script:gaps += [PSCustomObject]@{ id=$Id; severity=$Severity; description=$Description; repairTarget=$RepairTarget; source=$Source }
  Add-Gap $ProjectRoot $round $Id "story" $Severity $Description $RepairTarget $Source
}

function Get-StoryValues($Obj, [string[]]$Names) {
  $values = @()
  foreach ($name in $Names) {
    $value = $Obj.$name
    if ($null -eq $value) { continue }
    foreach ($item in @($value)) {
      if (![string]::IsNullOrWhiteSpace([string]$item)) { $values += $item }
    }
  }
  return @($values)
}

function Get-EvidencePathString($EvidenceItem) {
  if ($null -eq $EvidenceItem) { return "" }
  if ($EvidenceItem -is [string]) { return $EvidenceItem }
  foreach ($name in @("path","file","screenshot","log","result","evidence")) {
    if (![string]::IsNullOrWhiteSpace([string]$EvidenceItem.$name)) { return [string]$EvidenceItem.$name }
  }
  return [string]$EvidenceItem
}

function Test-EvidenceList($EvidenceItems) {
  $items = @($EvidenceItems) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
  if ($items.Count -eq 0) { return $false }
  foreach ($item in $items) {
    $path = Get-EvidencePathString $item
    if (!(Test-ProjectEvidencePath $ProjectRoot $path)) { return $false }
  }
  return $true
}

function Test-StoryVerifierRequiresE2E($Story, $TestPoints) {
  if ($Story.requiresE2E -eq $true -or $Story.fullFlow -eq $true) { return $true }
  if (@($TestPoints | Where-Object { $_.type -in @("e2e","state","flow") }).Count -gt 0) { return $true }
  $criteria = (@($Story.acceptanceCriteria) + @($Story.acceptance) + @($Story.criteria)) -join " "
  return ($criteria -match "(?i)full[- ]?flow|end[- ]?to[- ]?end|e2e|完整流程|全流程|端到端|闭环")
}

function Test-StoryVerifierE2EPass {
  if ($null -ne $e2eFlowResult -and (Normalize-AEVerdict $e2eFlowResult.status) -eq "PASS") { return $true }
  if ($null -ne $generatedStoryTests -and $null -ne $generatedStoryTests.results) {
    return (@($generatedStoryTests.results | Where-Object { $_.name -eq "e2e-flow" -and $_.status -eq "PASS" }).Count -gt 0)
  }
  return $false
}

if ($null -eq $target -or $null -eq $target.stories) {
  Add-StoryGap "GAP-STORY-TARGET-MISSING" "HARD_FAIL" "story-target.json is missing or invalid." "Run run-story-extract.ps1 and run-story-normalize.ps1, then map story evidence." (Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget)
} else {
  $stories = @($target.stories)
  $candidateCount = if ($null -ne $candidates -and $null -ne $candidates.candidates) { @($candidates.candidates).Count } else { 0 }
  if ($stories.Count -eq 0 -and $candidateCount -gt 0) {
    Add-StoryGap "GAP-STORY-CANDIDATES-NOT-NORMALIZED" "HARD_FAIL" "Story candidates exist but story-target.json has no normalized stories." "Normalize story-candidates.json into story-target.json before implementation or final PASS." (Get-RelativeEvidencePath $ProjectRoot $p.StoryCandidates)
  }
  foreach ($story in $stories) {
    $storyId = if (![string]::IsNullOrWhiteSpace([string]$story.storyId)) { [string]$story.storyId } elseif (![string]::IsNullOrWhiteSpace([string]$story.id)) { [string]$story.id } else { "STORY-UNKNOWN" }
    $priority = [string]$story.priority
    if ([string]::IsNullOrWhiteSpace($priority)) { $priority = "P1" }
    $status = [string]$story.status
    $source = if (![string]::IsNullOrWhiteSpace([string]$story.source)) { [string]$story.source } else { Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget }
    $inScope = $status -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED")
    $acceptance = Get-StoryValues $story @("acceptanceCriteria","acceptance","criteria")
    $testPoints = @($story.testPoints) | Where-Object { $null -ne $_ }
    if ($testPoints.Count -eq 0 -and $null -ne $matrix -and $null -ne $matrix.testPoints) {
      $testPoints = @($matrix.testPoints | Where-Object { $_.storyId -eq $storyId })
    }
    $storyEvidence = Get-StoryValues $story @("evidence","evidencePaths")
    $surfaces = Get-StoryValues $story @("surfaces","routes","screens")
    $apis = Get-StoryValues $story @("apis","endpoints")
    $dataModels = Get-StoryValues $story @("dataModels","models","entities")
    $evidenceRequired = Get-StoryValues $story @("evidenceRequired","verification","verificationRequired")
    $storyOpenGaps = @()
    if ($status -eq "CANDIDATE" -or $story.normalized -eq $false) {
      $id = "GAP-$storyId-CANDIDATE"
      Add-StoryGap $id "HARD_FAIL" "Story $storyId is still a candidate." "Normalize $storyId with actor, goal, acceptance criteria, test points, and evidence expectations." $source
      $storyOpenGaps += $id
    }
    if ($priority -in @("P0","P1") -and $inScope) {
      if ($status -notin @("PASS","PASS_WITH_LIMITATION")) {
        $id = "GAP-$storyId-STATUS"
        Add-StoryGap $id "IN_SCOPE_GAP" "P0/P1 story $storyId status is $status, not PASS/PASS_WITH_LIMITATION." "Implement/repair $storyId and attach truthful test-point evidence." $source
        $storyOpenGaps += $id
      }
      if ($acceptance.Count -eq 0) {
        $id = "GAP-$storyId-ACCEPTANCE"
        Add-StoryGap $id "HARD_FAIL" "P0/P1 story $storyId has no acceptance criteria." "Add concrete acceptanceCriteria for $storyId." $source
        $storyOpenGaps += $id
      }
      if ($testPoints.Count -eq 0) {
        $id = "GAP-$storyId-TESTPOINTS"
        Add-StoryGap $id "HARD_FAIL" "P0/P1 story $storyId has no test points." "Run run-story-test-generate.ps1 or add route/API/E2E/visual testPoints for $storyId." $source
        $storyOpenGaps += $id
      }
      if (($surfaces.Count + $apis.Count + $dataModels.Count) -eq 0 -and $testPoints.Count -eq 0) {
        $id = "GAP-$storyId-TARGET-MAP"
        Add-StoryGap $id "IN_SCOPE_GAP" "P0/P1 story $storyId has no surface/API/data/test target mapping." "Map $storyId to implementation surfaces, APIs, data models, or explicit test points." $source
        $storyOpenGaps += $id
      }
      if ($evidenceRequired.Count -eq 0) {
        $id = "GAP-$storyId-EVIDENCE-REQUIRED"
        Add-StoryGap $id "IN_SCOPE_GAP" "P0/P1 story $storyId has no evidenceRequired list." "Declare route/API/E2E/visual evidence required for $storyId." $source
        $storyOpenGaps += $id
      }
      if ($storyEvidence.Count -eq 0 -and $testPoints.Count -eq 0) {
        $id = "GAP-$storyId-EVIDENCE"
        Add-StoryGap $id "HARD_FAIL" "P0/P1 story $storyId has no story-level or test-point evidence." "Attach command logs, screenshots, API results, or E2E evidence for $storyId." $source
        $storyOpenGaps += $id
      } elseif ($storyEvidence.Count -gt 0 -and !(Test-EvidenceList $storyEvidence)) {
        $id = "GAP-$storyId-EVIDENCE-MISSING"
        Add-StoryGap $id "HARD_FAIL" "P0/P1 story $storyId references missing story-level evidence." "Create or correct evidence paths for $storyId." $source
        $storyOpenGaps += $id
      }
      foreach ($tp in $testPoints) {
        $tpId = if (![string]::IsNullOrWhiteSpace([string]$tp.id)) { [string]$tp.id } else { "TP-$storyId-UNKNOWN" }
        $tpStatus = [string]$tp.status
        $tpEvidence = Get-StoryValues $tp @("evidence","evidencePaths","logs","screenshots","results")
        $tpRequired = !($tp.required -eq $false -or $tpStatus -in @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED"))
        if ($tpRequired) {
          if ([string]::IsNullOrWhiteSpace([string]$tp.target)) {
            $id = "GAP-$tpId-TARGET"
            Add-StoryGap $id "IN_SCOPE_GAP" "Test point $tpId for story $storyId has no target." "Add a route/API/E2E/visual target for $tpId." $source
            $storyOpenGaps += $id
          }
          if ([string]::IsNullOrWhiteSpace([string]$tp.expected)) {
            $id = "GAP-$tpId-EXPECTED"
            Add-StoryGap $id "IN_SCOPE_GAP" "Test point $tpId for story $storyId has no expected result." "Add expected behavior for $tpId." $source
            $storyOpenGaps += $id
          }
          if ($tpStatus -notin @("PASS","PASS_WITH_LIMITATION")) {
            $id = "GAP-$tpId-STATUS"
            Add-StoryGap $id "IN_SCOPE_GAP" "Test point $tpId for story $storyId status is $tpStatus, not PASS/PASS_WITH_LIMITATION." "Run or implement the test point and attach evidence." $source
            $storyOpenGaps += $id
          }
          if ($tpEvidence.Count -eq 0) {
            $id = "GAP-$tpId-EVIDENCE"
            Add-StoryGap $id "HARD_FAIL" "Test point $tpId for P0/P1 story $storyId has no evidence." "Attach executable evidence for $tpId." $source
            $storyOpenGaps += $id
          } elseif (!(Test-EvidenceList $tpEvidence)) {
            $id = "GAP-$tpId-EVIDENCE-MISSING"
            Add-StoryGap $id "HARD_FAIL" "Test point $tpId references missing evidence." "Create or correct evidence paths for $tpId." $source
            $storyOpenGaps += $id
          }
        }
      }
      if ((Test-StoryVerifierRequiresE2E $story $testPoints) -and -not (Test-StoryVerifierE2EPass)) {
        $id = "GAP-$storyId-E2E-FULL-FLOW"
        Add-StoryGap $id "HARD_FAIL" "P0/P1 story $storyId requires E2E/full-flow evidence, but no E2E verifier PASS exists." "Configure commands.e2e or run generated e2e-flow evidence for $storyId." $source
        $storyOpenGaps += $id
      }
    }
    if ($status -in @("PASS_WITH_LIMITATION","DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","MANUAL_REVIEW_REQUIRED","PRODUCT_DECISION_REQUIRED")) {
      $limitations += [PSCustomObject]@{ storyId=$storyId; status=$status; source=$source }
    }
    $statuses += [PSCustomObject]@{
      storyId = $storyId
      priority = $priority
      status = $status
      acceptanceCriteria = $acceptance.Count
      testPoints = $testPoints.Count
      evidence = $storyEvidence.Count
      openGaps = $storyOpenGaps
    }
  }
}

$statusOut = if ($gaps.Count -gt 0) { "HARD_FAIL" } elseif ($limitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" }
@{
  schemaVersion = $AE_SCHEMA_VERSION
  lane = "story-verifier"
  status = $statusOut
  generatedAt = (Get-Date).ToString("s")
  stories = $statuses
  gaps = $gaps
  limitations = $limitations
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.StoryStatus

Write-LaneResult $ProjectRoot "story-verifier" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget),(Get-RelativeEvidencePath $ProjectRoot $p.StoryTestMatrix),(Get-RelativeEvidencePath $ProjectRoot $p.StoryStatus),(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)) $gaps @("Close story gaps, attach test-point evidence, then rerun run-story-verify.ps1 and final gate.")
Add-VerificationResult $ProjectRoot "story-verifier" $statusOut "$($gaps.Count) story gap(s), $($limitations.Count) limitation(s)" $p.StoryStatus
Write-Host "[$statusOut] story-verifier: $($gaps.Count) gap(s), $($limitations.Count) limitation(s)"
