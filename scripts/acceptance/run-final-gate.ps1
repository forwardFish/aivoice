param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast", [switch]$Strict)
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
try { $gapList = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json } catch { $gapList = $null }
try { $summary = Get-Content -LiteralPath $p.MachineSummary -Raw | ConvertFrom-Json } catch { $summary = $null }
try { $requirementsTarget = Get-Content -LiteralPath $p.RequirementTarget -Raw | ConvertFrom-Json } catch { $requirementsTarget = $null }
try { $requirementCandidates = Get-Content -LiteralPath $p.RequirementCandidates -Raw | ConvertFrom-Json } catch { $requirementCandidates = $null }
try { $storyTarget = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $storyTarget = $null }
try { $storyCandidates = Get-Content -LiteralPath $p.StoryCandidates -Raw | ConvertFrom-Json } catch { $storyCandidates = $null }
try { $storyTestMatrix = Get-Content -LiteralPath $p.StoryTestMatrix -Raw | ConvertFrom-Json } catch { $storyTestMatrix = $null }
try { $storyQualityGate = Get-Content -LiteralPath $p.StoryQualityGate -Raw | ConvertFrom-Json } catch { $storyQualityGate = $null }
try { $storyMaterializedTests = Get-Content -LiteralPath $p.StoryMaterializedTests -Raw | ConvertFrom-Json } catch { $storyMaterializedTests = $null }
try { $storyAcceptanceSummary = Get-Content -LiteralPath $p.StoryAcceptanceSummary -Raw | ConvertFrom-Json } catch { $storyAcceptanceSummary = $null }
try { $generatedStoryTests = Get-Content -LiteralPath (Join-Path $p.Results "generated-story-tests.json") -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $generatedStoryTests = $null }
try { $requirementSectionMap = Get-Content -LiteralPath $p.RequirementSectionMap -Raw | ConvertFrom-Json } catch { $requirementSectionMap = $null }
try { $e2eFlowResult = Get-Content -LiteralPath (Join-Path $p.Results "e2e-flow.json") -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $e2eFlowResult = $null }
try { $uiTarget = Get-Content -LiteralPath $p.UiTarget -Raw | ConvertFrom-Json } catch { $uiTarget = $null }
try { $uiVerifierResult = Get-Content -LiteralPath (Join-Path $p.Results "ui-verifier.json") -Raw -ErrorAction Stop | ConvertFrom-Json } catch { $uiVerifierResult = $null }
try {
  $stateForStrict = Get-Content -LiteralPath $p.ConvergenceState -Raw | ConvertFrom-Json
  if ($stateForStrict.strict -eq $true) { $Strict = $true }
} catch {}

function Get-FinalGateConfigLane([string]$Lane) {
  switch ($Lane) {
    "frontend" { return "frontend" }
    "frontend-test" { return "frontend" }
    "backend" { return "backend" }
    "backend-test" { return "backend" }
    "db-e2e" { return "backend" }
    "ui-capture" { return "visual" }
    "ui-verifier" { return "visual" }
    "ui-pixel-diff" { return "visual" }
    "compare-ui" { return "visual" }
    "e2e-flow" { return "integration" }
    "integration" { return "integration" }
    "full-flow-smoke" { return "integration" }
    "contract" { return "contract" }
    "contract-map" { return "contract" }
    "contract-verifier" { return "contract" }
    "api-smoke" { return "contract" }
    "requirement-coverage" { return "requirements" }
    "requirement-section-map" { return "requirements" }
    "requirement-verifier" { return "requirements" }
    "requirement-extract" { return "requirements" }
    "requirements-candidates" { return "requirements" }
    "story-curation" { return "stories" }
    "story-test-materialize" { return "stories" }
    "generated-story-tests" { return "stories" }
    "story-quality-gate" { return "stories" }
    "story-verifier" { return "stories" }
    "story-final-report" { return "stories" }
    "story-normalize" { return "stories" }
    "story-test-generate" { return "stories" }
    "story-extract" { return "stories" }
    "secret-guard" { return "secretGuard" }
    "report-integrity" { return "reportIntegrity" }
    default { return "" }
  }
}

function Test-FinalGateLaneEnabled([string]$ConfigLane) {
  if ([string]::IsNullOrWhiteSpace($ConfigLane)) { return $true }
  switch ($ConfigLane) {
    "requirements" { return (Get-HarnessLaneEnabled $ProjectRoot "requirements" $true) }
    "stories" { return (Get-HarnessLaneEnabled $ProjectRoot "stories" $true) }
    "secretGuard" { return (Get-HarnessLaneEnabled $ProjectRoot "secretGuard" $true) }
    "reportIntegrity" { return (Get-HarnessLaneEnabled $ProjectRoot "reportIntegrity" $true) }
    default { return (Get-HarnessLaneEnabled $ProjectRoot $ConfigLane $false) }
  }
}

$laneSuggestions = @()
$visualLaneEnabled = Test-FinalGateLaneEnabled "visual"
$contractLaneEnabled = Test-FinalGateLaneEnabled "contract"
$integrationLaneEnabled = Test-FinalGateLaneEnabled "integration"

function Test-FinalGateLaneExplicitlyConfigured([string]$Lane) {
  if ([string]::IsNullOrWhiteSpace($Lane)) { return $false }
  if (!(Test-Path -LiteralPath $p.HarnessConfig)) { return $false }
  $lines = Get-Content -LiteralPath $p.HarnessConfig
  $inLanes = $false
  foreach ($line in $lines) {
    if ($line -match "^\s*lanes\s*:\s*$") { $inLanes = $true; continue }
    if ($inLanes -and $line -match "^\S") { $inLanes = $false }
    if ($inLanes -and $line -match "^\s{2}$Lane\s*:\s*$") { return $true }
  }
  return $false
}

function Add-FinalGateAutoDetectedLaneSuggestions {
  $adapterPath = Join-Path $p.Results "adapter-detect.json"
  if (!(Test-Path -LiteralPath $adapterPath)) { return }
  try { $adapterResult = Get-Content -LiteralPath $adapterPath -Raw | ConvertFrom-Json } catch { return }
  $adapters = @($adapterResult.adapters)
  $detected = @()
  if (@($adapters | Where-Object { $_ -in @("next","react-vite","flutter") }).Count -gt 0) { $detected += "frontend" }
  if (@($adapters | Where-Object { $_ -in @("node-api","nest-prisma","python") }).Count -gt 0) { $detected += "backend" }
  if (@($adapters | Where-Object { $_ -in @("next","react-vite","flutter","node-api","nest-prisma","python") }).Count -gt 0) { $detected += "contract" }
  foreach ($lane in @($detected | Select-Object -Unique)) {
    if (-not (Test-FinalGateLaneExplicitlyConfigured $lane)) {
      $script:laneSuggestions += "Adapter auto-detected $lane lane from adapter-detect.json, but harness.yml does not explicitly configure lanes.$lane.enabled; decide whether it should gate final acceptance."
    }
  }
}

Add-FinalGateAutoDetectedLaneSuggestions

function Get-FinalGateRelevantSummaryEntries($Entries) {
  $filtered = @()
  foreach ($entry in @($Entries)) {
    $lane = [string]$entry.lane
    $configLane = Get-FinalGateConfigLane $lane
    if (Test-FinalGateLaneEnabled $configLane) {
      $filtered += $entry
    } else {
      $script:laneSuggestions += "Verifier lane $lane produced result while harness.yml lane $configLane is disabled; consider enabling $configLane if this evidence is expected."
    }
  }
  return @($filtered)
}

function Get-FinalGateResultSummary {
  $hardFails = @()
  $documentedBlockers = @()
  $manual = @()
  $deferred = @()
  foreach ($file in Get-ChildItem -LiteralPath $p.Results -Filter *.json -ErrorAction SilentlyContinue) {
    try { $r = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json } catch { continue }
    if ([string]::IsNullOrWhiteSpace([string]$r.lane)) { continue }
    if ($r.lane -in @("final-gate","run-all","gap-repair","repair")) { continue }
    if ($r.lane -in @("route-smoke-generated","api-smoke-generated","e2e-flow-generated")) { continue }
    $status = Normalize-AEVerdict $r.status
    $entry = [PSCustomObject]@{
      lane = $r.lane
      status = $status
      file = (Get-RelativeEvidencePath $ProjectRoot $file.FullName)
      blockers = @($r.blockers)
    }
    switch ($status) {
      "HARD_FAIL" { $hardFails += $entry }
      "IN_SCOPE_GAP" { $hardFails += $entry }
      "DOCUMENTED_BLOCKER" { $documentedBlockers += $entry }
      "BLOCKED_BY_ENVIRONMENT" { $documentedBlockers += $entry }
      "PASS_NEEDS_MANUAL_UI_REVIEW" { $manual += $entry }
      "MANUAL_REVIEW_REQUIRED" { $manual += $entry }
      "PRODUCT_DECISION_REQUIRED" { $manual += $entry }
      "PASS_WITH_LIMITATION" { $manual += $entry }
      "DEFERRED" { $deferred += $entry }
    }
  }
  return [PSCustomObject]@{
    hardFails = $hardFails
    documentedBlockers = $documentedBlockers
    manualReviewRequired = $manual
    deferred = $deferred
  }
}

$hardGaps = @()
if ($null -ne $gapList) {
  $hardGaps = @($gapList.gaps) | Where-Object { $_.severity -in @("HARD_FAIL","IN_SCOPE_GAP") -and $_.status -ne "CLOSED" }
}
$verdict = "PASS"
$reasons = @()
$resultSummary = Get-FinalGateResultSummary
$summaryHardFails = @()
$summaryDocumented = @()
$summaryManual = @()
$summaryDeferred = @()
if ($hardGaps.Count -gt 0) { $verdict = "HARD_FAIL"; $reasons += "$($hardGaps.Count) unresolved hard/in-scope gap(s)" }
if ($null -eq $summary) { $verdict = "HARD_FAIL"; $reasons += "machine-summary.json missing or invalid" }
else {
  $summaryHardFails = Get-FinalGateRelevantSummaryEntries (@($summary.hardFails) + @($resultSummary.hardFails))
  $summaryDocumented = Get-FinalGateRelevantSummaryEntries (@($summary.documentedBlockers) + @($resultSummary.documentedBlockers))
  $summaryManual = Get-FinalGateRelevantSummaryEntries (@($summary.manualReviewRequired) + @($resultSummary.manualReviewRequired))
  $summaryDeferred = Get-FinalGateRelevantSummaryEntries (@($summary.deferred) + @($resultSummary.deferred))
}
if ($null -ne $summary -and @($summaryHardFails).Count -gt 0) { $verdict = "HARD_FAIL"; $reasons += "machine summary contains hard failures" }
elseif ($null -ne $summary -and $verdict -eq "PASS" -and ((@($summaryDocumented).Count + @($summaryManual).Count + @($summaryDeferred).Count) -gt 0)) {
  $verdict = "PASS_WITH_LIMITATION"
  $reasons += "manual/deferred/documented blocker lanes remain"
}

$verifierDefinitions = @(
  @{ lane="requirement-coverage"; file="requirement-coverage.json"; purePassRequired=$true; configLane="requirements" },
  @{ lane="requirement-section-map"; file="requirement-section-map.json"; purePassRequired=$true; configLane="requirements" },
  @{ lane="requirement-verifier"; file="requirement-verifier.json"; purePassRequired=$true; configLane="requirements" },
  @{ lane="story-curation"; file="story-curation.json"; purePassRequired=$false; configLane="stories" },
  @{ lane="story-test-materialize"; file="story-test-materialize.json"; purePassRequired=$false; configLane="stories" },
  @{ lane="generated-story-tests"; file="generated-story-tests.json"; purePassRequired=$true; configLane="stories" },
  @{ lane="story-quality-gate"; file="story-quality-gate.json"; purePassRequired=$true; configLane="stories" },
  @{ lane="story-verifier"; file="story-verifier.json"; purePassRequired=$true; configLane="stories" },
  @{ lane="story-final-report"; file="story-final-report.json"; purePassRequired=$false; configLane="stories" },
  @{ lane="ui-capture"; file="ui-capture.json"; purePassRequired=$true; configLane="visual" },
  @{ lane="ui-verifier"; file="ui-verifier.json"; purePassRequired=$false; configLane="visual" },
  @{ lane="contract-verifier"; file="contract-verifier.json"; purePassRequired=$true; configLane="contract" },
  @{ lane="frontend-test"; file="frontend-test.json"; purePassRequired=$true; configLane="frontend" },
  @{ lane="backend-test"; file="backend-test.json"; purePassRequired=$true; configLane="backend" },
  @{ lane="db-e2e"; file="db-e2e.json"; purePassRequired=$true; configLane="backend" },
  @{ lane="e2e-flow"; file="e2e-flow.json"; purePassRequired=$true; configLane="integration" },
  @{ lane="report-integrity"; file="report-integrity.json"; purePassRequired=$true; configLane="reportIntegrity" },
  @{ lane="secret-guard"; file="secret-guard.json"; purePassRequired=$false; configLane="secretGuard" }
)
$requiredVerifierResults = @()
foreach ($definition in $verifierDefinitions) {
  if (Test-FinalGateLaneEnabled $definition.configLane) {
    $requiredVerifierResults += $definition
  } else {
    $resultPath = Join-Path $p.Results $definition.file
    if (Test-Path -LiteralPath $resultPath) {
      $laneSuggestions += "Verifier result $($definition.file) exists, but harness.yml lane $($definition.configLane) is disabled; enable it if this lane should gate acceptance."
    }
  }
}
foreach ($required in $requiredVerifierResults) {
  $resultPath = Join-Path $p.Results $required.file
  if (!(Test-Path -LiteralPath $resultPath)) {
    $verdict = "HARD_FAIL"
    $reasons += "required verifier result missing: $($required.file)"
    continue
  }
  try { $result = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json } catch { $result = $null }
  if ($null -eq $result) {
    $verdict = "HARD_FAIL"
    $reasons += "required verifier result invalid: $($required.file)"
    continue
  }
  $status = Normalize-AEVerdict $result.status
  switch ($status) {
    "PASS" { }
    "PASS_WITH_LIMITATION" {
      if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
      $reasons += "$($required.lane) is PASS_WITH_LIMITATION"
      if ($Strict) {
        $verdict = "FAIL"
        $reasons += "Strict mode does not allow PASS_WITH_LIMITATION for $($required.lane)"
      }
    }
    "PASS_NEEDS_MANUAL_UI_REVIEW" {
      if ($verdict -in @("PASS","PASS_WITH_LIMITATION")) { $verdict = "PASS_NEEDS_MANUAL_UI_REVIEW" }
      $reasons += "$($required.lane) needs manual UI review"
      if ($Strict) {
        $verdict = "FAIL"
        $reasons += "Strict mode does not allow manual UI review for $($required.lane)"
      }
    }
    "DEFERRED" {
      if ($required.purePassRequired -eq $true) {
        if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
        $reasons += "$($required.lane) is DEFERRED, so pure PASS is not allowed"
        if ($Strict) { $verdict = "FAIL"; $reasons += "Strict mode does not allow DEFERRED for $($required.lane)" }
      } else {
        if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
        $reasons += "$($required.lane) is DEFERRED"
        if ($Strict) { $verdict = "FAIL"; $reasons += "Strict mode does not allow DEFERRED for $($required.lane)" }
      }
    }
    "DOCUMENTED_BLOCKER" {
      if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
      $reasons += "$($required.lane) has a documented blocker"
      if ($Strict) { $verdict = "BLOCKED"; $reasons += "Strict mode treats documented blockers as BLOCKED" }
    }
    "BLOCKED_BY_ENVIRONMENT" {
      $verdict = "BLOCKED"
      $reasons += "$($required.lane) is blocked by environment"
    }
    "BLOCKED" {
      $verdict = "BLOCKED"
      $reasons += "$($required.lane) is BLOCKED"
    }
    "MANUAL_REVIEW_REQUIRED" {
      if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
      $reasons += "$($required.lane) requires manual review"
      if ($Strict) { $verdict = "FAIL"; $reasons += "Strict mode does not allow MANUAL_REVIEW_REQUIRED for $($required.lane)" }
    }
    "PRODUCT_DECISION_REQUIRED" {
      $verdict = "BLOCKED"
      $reasons += "$($required.lane) requires product decision"
    }
    default {
      $verdict = "HARD_FAIL"
      $reasons += "$($required.lane) is $status"
    }
  }
}

if ($null -eq $requirementsTarget -or $null -eq $requirementsTarget.requirements) {
  $verdict = "HARD_FAIL"
  $reasons += "requirement-target.json missing or invalid"
} else {
  if (@($requirementsTarget.requirements).Count -eq 0 -and $null -ne $requirementCandidates -and @($requirementCandidates.candidates).Count -gt 0) {
    $verdict = "HARD_FAIL"
    $reasons += "requirement-candidates.json has candidates but requirement-target.json has no normalized requirements"
  }
  foreach ($req in @($requirementsTarget.requirements)) {
    if ($req.status -eq "CANDIDATE" -or $req.normalized -eq $false) {
      $verdict = "HARD_FAIL"
      $reasons += "requirement-target.json contains unnormalized candidate requirement $($req.id)"
    }
    if ($req.priority -in @("P0","P1")) {
      if ($req.status -notin @("PASS","PASS_WITH_LIMITATION")) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 requirement $($req.id) is not PASS/PASS_WITH_LIMITATION"
      }
      if ($Strict -and $req.status -ne "PASS") {
        $verdict = "FAIL"
        $reasons += "Strict mode requires P0/P1 requirement $($req.id) to be PASS"
      }
      if (@($req.evidence).Count -eq 0) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 requirement $($req.id) has no evidence"
      }
    }
  }
}

if ($null -eq $requirementSectionMap -or $null -eq $requirementSectionMap.sections) {
  $verdict = "HARD_FAIL"
  $reasons += "requirement-section-map.json missing or invalid"
} else {
  foreach ($section in @($requirementSectionMap.sections)) {
    $sectionId = if (![string]::IsNullOrWhiteSpace([string]$section.sectionId)) { [string]$section.sectionId } else { "SEC-UNKNOWN" }
    $requiresImplementation = ($section.requiresImplementation -eq $true -or ([string]::IsNullOrWhiteSpace([string]$section.requiresImplementation) -and $section.sectionType -in @("functional","ui","api","nonfunctional")))
    if ($section.priority -in @("P0","P1") -and $requiresImplementation) {
      $coveredReqs = @($section.coveredByRequirementIds) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
      $coveredStories = @($section.coveredByStoryIds) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
      if (($coveredReqs.Count + $coveredStories.Count) -eq 0 -or $section.coverageStatus -notin @("PASS","PASS_WITH_LIMITATION")) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 implementation section $sectionId has no requirement/story coverage"
      }
    } elseif ($section.coverageStatus -eq "MANUAL_REVIEW_REQUIRED" -and $verdict -eq "PASS") {
      $verdict = "PASS_WITH_LIMITATION"
      $reasons += "PRD section $sectionId has unknown sectionType and needs manual classification"
    }
  }
}

function Get-FinalGateValues($Obj, [string[]]$Names) {
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

function Get-FinalGateEvidencePath($EvidenceItem) {
  if ($null -eq $EvidenceItem) { return "" }
  if ($EvidenceItem -is [string]) { return $EvidenceItem }
  foreach ($name in @("path","file","screenshot","log","result","evidence")) {
    if (![string]::IsNullOrWhiteSpace([string]$EvidenceItem.$name)) { return [string]$EvidenceItem.$name }
  }
  return [string]$EvidenceItem
}

function Test-FinalGateEvidenceList($ProjectRoot, $EvidenceItems) {
  $items = @($EvidenceItems) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
  if ($items.Count -eq 0) { return $false }
  foreach ($item in $items) {
    $path = Get-FinalGateEvidencePath $item
    if (!(Test-ProjectEvidencePath $ProjectRoot $path)) { return $false }
  }
  return $true
}

function Test-GeneratedStoryTestExecuted($GeneratedStoryTests, [string]$PointType) {
  if ($null -eq $GeneratedStoryTests -or $null -eq $GeneratedStoryTests.results) { return $false }
  $resultName = switch ($PointType) {
    "route" { "route-smoke" }
    "content" { "route-smoke" }
    "api" { "api-smoke" }
    "e2e" { "e2e-flow" }
    "state" { "e2e-flow" }
    "flow" { "e2e-flow" }
    default { "" }
  }
  if ([string]::IsNullOrWhiteSpace($resultName)) { return $true }
  $result = @($GeneratedStoryTests.results | Where-Object { $_.name -eq $resultName } | Select-Object -First 1)
  return ($null -ne $result -and $result.status -eq "PASS")
}

function Test-StoryRequiresE2E($Story, $TestPoints) {
  if ($Story.requiresE2E -eq $true -or $Story.fullFlow -eq $true) { return $true }
  if (@($TestPoints | Where-Object { $_.type -in @("e2e","state","flow") }).Count -gt 0) { return $true }
  $criteria = (@($Story.acceptanceCriteria) + @($Story.acceptance) + @($Story.criteria)) -join " "
  return ($criteria -match "(?i)full[- ]?flow|end[- ]?to[- ]?end|e2e|完整流程|全流程|端到端|闭环")
}

function Test-StoryRequiresE2E($Story, $TestPoints) {
  if ($Story.requiresE2E -eq $true -or $Story.fullFlow -eq $true) { return $true }
  if (@($TestPoints | Where-Object { $_.type -in @("e2e","state","flow") }).Count -gt 0) { return $true }
  $criteria = (@($Story.acceptanceCriteria) + @($Story.acceptance) + @($Story.criteria)) -join " "
  return (Test-AEFullFlowText $criteria)
}

if ($null -eq $storyQualityGate) {
  $verdict = "HARD_FAIL"
  $reasons += "story-quality-gate.json missing or invalid"
} elseif ($storyQualityGate.status -notin @("PASS","PASS_WITH_LIMITATION")) {
  $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
  $reasons += "story-quality-gate status is $($storyQualityGate.status)"
}

if ($null -eq $storyMaterializedTests) {
  $verdict = "HARD_FAIL"
  $reasons += "story-materialized-tests.json missing or invalid"
}

if ($null -eq $storyAcceptanceSummary) {
  $verdict = "HARD_FAIL"
  $reasons += "story-acceptance-summary.json missing or invalid"
} elseif ($null -ne $storyAcceptanceSummary.summary) {
  if ([int]$storyAcceptanceSummary.summary.hardFailStories -gt 0) {
    $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
    $reasons += "story acceptance summary contains $($storyAcceptanceSummary.summary.hardFailStories) HARD_FAIL story item(s)"
  }
  if ($Strict -and ([int]$storyAcceptanceSummary.summary.passWithLimitationStories + [int]$storyAcceptanceSummary.summary.manualReviewRequiredStories + [int]$storyAcceptanceSummary.summary.deferredStories) -gt 0) {
    $verdict = "FAIL"
    $reasons += "Strict mode does not allow story limitations/manual/deferred outcomes"
  }
}

if ($null -eq $storyTarget -or $null -eq $storyTarget.stories) {
  $verdict = "HARD_FAIL"
  $reasons += "story-target.json missing or invalid"
} else {
  if (@($storyTarget.stories).Count -eq 0 -and $null -ne $storyCandidates -and @($storyCandidates.candidates).Count -gt 0) {
    $verdict = "HARD_FAIL"
    $reasons += "story-candidates.json has candidates but story-target.json has no normalized stories"
  }
  foreach ($story in @($storyTarget.stories)) {
    $storyId = if (![string]::IsNullOrWhiteSpace([string]$story.storyId)) { [string]$story.storyId } elseif (![string]::IsNullOrWhiteSpace([string]$story.id)) { [string]$story.id } else { "STORY-UNKNOWN" }
    $storyStatus = [string]$story.status
    if ($storyStatus -eq "CANDIDATE" -or $story.normalized -eq $false) {
      $verdict = "HARD_FAIL"
      $reasons += "story-target.json contains unnormalized candidate story $storyId"
    }
    if ($story.priority -in @("P0","P1") -and $storyStatus -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED")) {
      if ($storyStatus -notin @("PASS","PASS_WITH_LIMITATION")) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 story $storyId is not PASS/PASS_WITH_LIMITATION"
      }
      if ($Strict -and $storyStatus -ne "PASS") {
        $verdict = "FAIL"
        $reasons += "Strict mode requires P0/P1 story $storyId to be PASS"
      }
      $acceptance = Get-FinalGateValues $story @("acceptanceCriteria","acceptance","criteria")
      if ($acceptance.Count -eq 0) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 story $storyId has no acceptance criteria"
      }
      $testPoints = @($story.testPoints) | Where-Object { $null -ne $_ }
      if ($testPoints.Count -eq 0 -and $null -ne $storyTestMatrix -and $null -ne $storyTestMatrix.testPoints) {
        $testPoints = @($storyTestMatrix.testPoints | Where-Object { $_.storyId -eq $storyId })
      }
      if ($testPoints.Count -eq 0) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 story $storyId has no test points"
      }
      $materializedStory = $null
      if ($null -ne $storyMaterializedTests -and $null -ne $storyMaterializedTests.stories) {
        $materializedStory = @($storyMaterializedTests.stories | Where-Object { $_.storyId -eq $storyId } | Select-Object -First 1)
      }
      if ($null -eq $materializedStory -or @($materializedStory.testPoints).Count -eq 0) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "P0/P1 story $storyId has no materialized test point bindings"
      } else {
        foreach ($mt in @($materializedStory.testPoints)) {
          $mtId = if (![string]::IsNullOrWhiteSpace([string]$mt.testPointId)) { [string]$mt.testPointId } else { "TP-$storyId-UNKNOWN" }
          $mtStatus = [string]$mt.materializationStatus
          if ($mtStatus -notin @("GENERATED","BOUND","BOUND_TO_UI_VERIFIER","MANUAL_REVIEW_REQUIRED","DEFERRED")) {
            $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
            $reasons += "P0/P1 story $storyId test point $mtId has invalid materialization status $mtStatus"
          }
          if ($mtStatus -in @("MANUAL_REVIEW_REQUIRED","DEFERRED")) {
            if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
            $reasons += "P0/P1 story $storyId test point $mtId materialization is $mtStatus"
            if ($Strict) {
              $verdict = "FAIL"
              $reasons += "Strict mode does not allow $mtStatus materialization for $mtId"
            }
          }
          if ($mtStatus -in @("GENERATED","BOUND","BOUND_TO_UI_VERIFIER") -and ([string]::IsNullOrWhiteSpace([string]$mt.command) -or [string]::IsNullOrWhiteSpace([string]$mt.evidenceOutput))) {
            $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
            $reasons += "P0/P1 story $storyId test point $mtId lacks command or evidenceOutput binding"
          }
          if ($mtStatus -eq "GENERATED" -and -not (Test-GeneratedStoryTestExecuted $generatedStoryTests ([string]$mt.type)) ) {
            $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
            $reasons += "P0/P1 story $storyId generated test point $mtId was materialized but generated-story-tests did not execute it successfully"
          }
        }
      }
      if (Test-StoryRequiresE2E $story $testPoints) {
        if (-not $integrationLaneEnabled) {
          if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
          $laneSuggestions += "P0/P1 story $storyId appears to require E2E/full-flow evidence, but harness.yml lanes.integration.enabled is false; e2e-flow is not a hard required verifier in this run."
        } else {
          $e2ePass = $false
          if ($null -ne $e2eFlowResult -and (Normalize-AEVerdict $e2eFlowResult.status) -eq "PASS") { $e2ePass = $true }
          if (Test-GeneratedStoryTestExecuted $generatedStoryTests "e2e") { $e2ePass = $true }
          if (-not $e2ePass) {
            $e2eBlockedByEnvironment = (
              ($null -ne $e2eFlowResult -and [string]$e2eFlowResult.e2eClassification -eq "ENVIRONMENT_BLOCKER") -or
              ($null -ne $generatedStoryTests -and [string]$generatedStoryTests.e2eClassification -eq "ENVIRONMENT_BLOCKER")
            )
            if ($e2eBlockedByEnvironment) {
              $verdict = $(if ($Strict) { "BLOCKED" } elseif ($verdict -eq "PASS") { "PASS_WITH_LIMITATION" } else { $verdict })
              $reasons += "P0/P1 story $storyId requires E2E/full-flow evidence but the E2E verifier is blocked by environment/tooling, not confirmed code failure"
            } else {
              $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
              $reasons += "P0/P1 story $storyId requires E2E/full-flow evidence but e2e-flow or generated e2e evidence is not PASS"
            }
          }
        }
      }
      foreach ($tp in $testPoints) {
        $tpStatus = [string]$tp.status
        $tpId = if (![string]::IsNullOrWhiteSpace([string]$tp.id)) { [string]$tp.id } else { "TP-$storyId-UNKNOWN" }
        $tpRequired = !($tp.required -eq $false -or $tpStatus -in @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED"))
        if ($tpRequired) {
          if ($tpStatus -notin @("PASS","PASS_WITH_LIMITATION")) {
            $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
            $reasons += "P0/P1 story $storyId test point $tpId is not PASS/PASS_WITH_LIMITATION"
          }
          $tpEvidence = Get-FinalGateValues $tp @("evidence","evidencePaths","logs","screenshots","results")
          if (!(Test-FinalGateEvidenceList $ProjectRoot $tpEvidence)) {
            $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
            $reasons += "P0/P1 story $storyId test point $tpId has no existing evidence"
          }
        }
      }
    }
  }
}

if ($visualLaneEnabled -and $null -ne $uiTarget -and $null -ne $uiTarget.screens) {
  $requireDesktop = Get-HarnessBoolValue $ProjectRoot "visual" "requireDesktopScreenshot" $false
  $requireMobile = Get-HarnessBoolValue $ProjectRoot "visual" "requireMobileScreenshot" $false
  foreach ($screen in @($uiTarget.screens)) {
    $screenId = if ([string]::IsNullOrWhiteSpace([string]$screen.id)) { "UNKNOWN" } else { [string]$screen.id }
    $required = !($screen.required -eq $false -or $screen.status -in @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT"))
    if ($required) {
      $actual = ""
      foreach ($candidate in @($screen.visualEvidence, $screen.actualScreenshot, $screen.actual)) {
        if (![string]::IsNullOrWhiteSpace([string]$candidate)) { $actual = [string]$candidate; break }
      }
      if ([string]::IsNullOrWhiteSpace($actual) -or !(Test-ProjectEvidencePath $ProjectRoot $actual)) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "required UI screen $screenId has no existing actual screenshot/visual evidence"
      }
      if ($requireDesktop -and ([string]::IsNullOrWhiteSpace([string]$screen.actualScreenshotDesktop) -or !(Test-ProjectEvidencePath $ProjectRoot $screen.actualScreenshotDesktop))) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "required UI screen $screenId has no desktop screenshot evidence"
      }
      if ($requireMobile -and ([string]::IsNullOrWhiteSpace([string]$screen.actualScreenshotMobile) -or !(Test-ProjectEvidencePath $ProjectRoot $screen.actualScreenshotMobile))) {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "required UI screen $screenId has no mobile screenshot evidence"
      }
      if (![string]::IsNullOrWhiteSpace([string]$screen.structureStatus) -and $screen.structureStatus -ne "PASS") {
        $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
        $reasons += "required UI screen $screenId structureStatus is not PASS"
      }
      if (![string]::IsNullOrWhiteSpace([string]$screen.finalUiStatus)) {
        $finalUiStatus = Normalize-AEVerdict $screen.finalUiStatus
        switch ($finalUiStatus) {
          "PASS" { }
          "PASS_WITH_LIMITATION" {
            if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
            $reasons += "required UI screen $screenId finalUiStatus is PASS_WITH_LIMITATION"
            if ($Strict) { $verdict = "FAIL"; $reasons += "Strict mode does not allow UI limitation for $screenId" }
          }
          "PASS_NEEDS_MANUAL_UI_REVIEW" {
            if ($verdict -in @("PASS","PASS_WITH_LIMITATION")) { $verdict = "PASS_NEEDS_MANUAL_UI_REVIEW" }
            $reasons += "required UI screen $screenId finalUiStatus requires manual UI review"
            if ($Strict) { $verdict = "FAIL"; $reasons += "Strict mode does not allow manual UI review for $screenId" }
          }
          "MANUAL_REVIEW_REQUIRED" {
            if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
            $reasons += "required UI screen $screenId finalUiStatus is MANUAL_REVIEW_REQUIRED"
            if ($Strict) { $verdict = "FAIL"; $reasons += "Strict mode does not allow manual UI review for $screenId" }
          }
          default {
            $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
            $reasons += "required UI screen $screenId finalUiStatus is $finalUiStatus"
          }
        }
      }
      $mappingSourceText = (@($screen.mappingSource, $screen.routeMappingSource, $screen.source) -join " ")
      $autoGuessedMapping = ($mappingSourceText -match "(?i)auto|guess|filename")
      $hasAnyDiffEvidence = $false
      foreach ($candidate in @($screen.visualDiff, $screen.visualDiffEvidence, $screen.diffEvidence)) {
        if (![string]::IsNullOrWhiteSpace([string]$candidate) -and (Test-ProjectEvidencePath $ProjectRoot $candidate)) { $hasAnyDiffEvidence = $true; break }
      }
      if ($autoGuessedMapping -and -not $hasAnyDiffEvidence) {
        if ($verdict -eq "PASS") { $verdict = "PASS_WITH_LIMITATION" }
        $reasons += "auto-guessed UI mapping for $screenId has no visual diff evidence, so pure PASS is not allowed"
      }
      if ($screen.canClaimPixelPerfect -eq $true) {
        $claimDiff = ""
        foreach ($candidate in @($screen.visualDiff, $screen.visualDiffEvidence, $screen.diffEvidence)) {
          if (![string]::IsNullOrWhiteSpace([string]$candidate)) { $claimDiff = [string]$candidate; break }
        }
        if ([string]::IsNullOrWhiteSpace($claimDiff) -or !(Test-ProjectEvidencePath $ProjectRoot $claimDiff)) {
          $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
          $reasons += "required UI screen $screenId canClaimPixelPerfect is true without visual diff evidence"
        }
      }
      if ($Strict) {
        $strictDiff = ""
        foreach ($candidate in @($screen.visualDiff, $screen.visualDiffEvidence, $screen.diffEvidence)) {
          if (![string]::IsNullOrWhiteSpace([string]$candidate)) { $strictDiff = [string]$candidate; break }
        }
        if ([string]::IsNullOrWhiteSpace($strictDiff) -or !(Test-ProjectEvidencePath $ProjectRoot $strictDiff)) {
          $verdict = "FAIL"
          $reasons += "Strict mode requires visual diff evidence for UI screen $screenId"
        }
      }
      if ($screen.pixelPerfectStatus -eq "PASS") {
        $diff = ""
        foreach ($candidate in @($screen.visualDiff, $screen.visualDiffEvidence, $screen.diffEvidence)) {
          if (![string]::IsNullOrWhiteSpace([string]$candidate)) { $diff = [string]$candidate; break }
        }
        if ([string]::IsNullOrWhiteSpace($diff) -or !(Test-ProjectEvidencePath $ProjectRoot $diff)) {
          $verdict = $(if ($Strict) { "FAIL" } else { "HARD_FAIL" })
          $reasons += "required UI screen $screenId pixelPerfectStatus PASS has no visual diff evidence"
        }
      }
    }
  }
} elseif (-not $visualLaneEnabled -and $null -ne $uiTarget -and $null -ne $uiTarget.screens) {
  $laneSuggestions += "ui-target.json contains screens, but harness.yml lanes.visual.enabled is false; ui-capture/ui-verifier and UI screenshot checks are suggestions, not hard final-gate requirements."
}

$reportIntegrityPath = Join-Path $p.Results "report-integrity.json"
if (Test-Path -LiteralPath $reportIntegrityPath) {
  try { $reportIntegrity = Get-Content -LiteralPath $reportIntegrityPath -Raw | ConvertFrom-Json } catch { $reportIntegrity = $null }
  if ($null -eq $reportIntegrity -or $reportIntegrity.status -ne "PASS") {
    $verdict = "HARD_FAIL"
    $reasons += "report-integrity result is not PASS"
  }
} else {
  $verdict = "HARD_FAIL"
  $reasons += "report-integrity result is missing"
}

$secretGuardPath = Join-Path $p.Results "secret-guard.json"
if (Test-Path -LiteralPath $secretGuardPath) {
  try { $secretGuard = Get-Content -LiteralPath $secretGuardPath -Raw | ConvertFrom-Json } catch { $secretGuard = $null }
  if ($null -eq $secretGuard -or $secretGuard.status -notin @("PASS","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT")) {
    $verdict = "HARD_FAIL"
    $reasons += "secret-guard result is not PASS or documented blocker"
  } elseif ($secretGuard.status -in @("DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT") -and $verdict -eq "PASS") {
    $verdict = "PASS_WITH_LIMITATION"
    $reasons += "secret-guard has documented blocker"
  }
} else {
  $verdict = "HARD_FAIL"
  $reasons += "secret-guard result is missing"
}

if ($Strict -and $verdict -notin @("PASS","BLOCKED")) {
  if ($verdict -ne "FAIL") {
    $reasons += "Strict mode final verdict normalized from $verdict to FAIL"
  }
  $verdict = "FAIL"
}

function Get-ResultStatus($ProjectRoot, [string]$FileName, [string]$Default = "MISSING") {
  $paths = Get-AEPaths $ProjectRoot
  $path = Join-Path $paths.Results $FileName
  if (!(Test-Path -LiteralPath $path)) { return $Default }
  try {
    $obj = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    return (Normalize-AEVerdict $obj.status)
  } catch {
    return "INVALID"
  }
}

$requirementStatus = Get-ResultStatus $ProjectRoot "requirement-verifier.json"
$storyStatus = Get-ResultStatus $ProjectRoot "story-verifier.json"
$contractStatus = if ($contractLaneEnabled) { Get-ResultStatus $ProjectRoot "contract-verifier.json" } else { "DISABLED" }
$e2eStatus = if ($integrationLaneEnabled) { Get-ResultStatus $ProjectRoot "e2e-flow.json" } else { "DISABLED" }
$uiStatus = if ($visualLaneEnabled) { Get-ResultStatus $ProjectRoot "ui-verifier.json" } else { "DISABLED" }
$dbStatus = if (Test-FinalGateLaneEnabled "backend") { Get-ResultStatus $ProjectRoot "db-e2e.json" } else { "DISABLED" }
$secretStatus = Get-ResultStatus $ProjectRoot "secret-guard.json"
$reportStatus = Get-ResultStatus $ProjectRoot "report-integrity.json"
$uiLayerSummary = $null
try {
  $uiVerifierForSummary = Get-Content -LiteralPath (Join-Path $p.Results "ui-verifier.json") -Raw -ErrorAction Stop | ConvertFrom-Json
  $uiLayerSummary = $uiVerifierForSummary.uiLayerSummary
} catch {}
$pixelPerfectStatus = "NOT_CLAIMED"
try {
  $pixelDiff = Get-Content -LiteralPath (Join-Path $p.Results "ui-pixel-diff.json") -Raw -ErrorAction Stop | ConvertFrom-Json
  $pixelPerfectStatus = Normalize-AEVerdict $pixelDiff.status
} catch {
  if ($uiStatus -in @("PASS_NEEDS_MANUAL_UI_REVIEW","MANUAL_REVIEW_REQUIRED","PASS_WITH_LIMITATION")) { $pixelPerfectStatus = "MANUAL_REVIEW_REQUIRED" }
}
if ($null -ne $uiVerifierResult -and $uiVerifierResult.canClaimPixelPerfect -eq $false -and $pixelPerfectStatus -eq "PASS") {
  $pixelPerfectStatus = "MANUAL_REVIEW_REQUIRED"
}
$verdictClass = switch ($verdict) {
  "PASS" { "automated-pass" }
  "PASS_NEEDS_MANUAL_UI_REVIEW" { "functional-pass-visual-review-required" }
  "PASS_WITH_LIMITATION" { "functional-pass-with-documented-limitations" }
  "BLOCKED" { "blocked-by-authority-or-environment" }
  default { "failed-hard-gate-or-in-scope-gap" }
}
$requiresHumanReview = ($verdict -in @("PASS_NEEDS_MANUAL_UI_REVIEW","PASS_WITH_LIMITATION") -or $uiStatus -in @("PASS_NEEDS_MANUAL_UI_REVIEW","MANUAL_REVIEW_REQUIRED","PRODUCT_DECISION_REQUIRED"))
$canClaimPixelPerfect = ($pixelPerfectStatus -eq "PASS")
$requiredUiNotPure = ($visualLaneEnabled -and $uiStatus -in @("PASS_WITH_LIMITATION","PASS_NEEDS_MANUAL_UI_REVIEW","MANUAL_REVIEW_REQUIRED"))
$canShipLocally = ($verdict -eq "PASS" -and -not $requiredUiNotPure -and $requirementStatus -eq "PASS" -and $storyStatus -eq "PASS" -and $contractStatus -notin @("HARD_FAIL","FAIL","MISSING","INVALID") -and $e2eStatus -notin @("HARD_FAIL","FAIL","MISSING","INVALID") -and $dbStatus -notin @("HARD_FAIL","FAIL","MISSING","INVALID","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT"))
if ($requiredUiNotPure) {
  $reasons += "Required UI remains non-pure ($uiStatus); canShipLocally=false until fidelity gaps are repaired or explicitly reclassified."
}

function Get-ConfidenceFromStatus([string]$Status, [bool]$Enabled = $true) {
  if (-not $Enabled) { return 1.0 }
  switch (Normalize-AEVerdict $Status) {
    "PASS" { return 1.0 }
    "PASS_WITH_LIMITATION" { return 0.75 }
    "PASS_NEEDS_MANUAL_UI_REVIEW" { return 0.65 }
    "DEFERRED" { return 0.5 }
    "MANUAL_REVIEW_REQUIRED" { return 0.35 }
    "DOCUMENTED_BLOCKER" { return 0.25 }
    "BLOCKED_BY_ENVIRONMENT" { return 0.2 }
    "BLOCKED" { return 0.15 }
    default { return 0.0 }
  }
}

$visualEnabled = $visualLaneEnabled
$contractEnabled = $contractLaneEnabled
$integrationEnabled = $integrationLaneEnabled
$uiScreenshotsStatus = if (-not $visualEnabled) {
  "PASS"
} elseif ($null -ne $uiLayerSummary -and $uiLayerSummary.screenshotStatus) {
  [string]$uiLayerSummary.screenshotStatus
} else {
  $uiStatus
}
$manualReviewRemainingScore = if ($requiresHumanReview) { 0.0 } else { 1.0 }
$confidenceFactors = [ordered]@{
  requirementsCovered = Get-ConfidenceFromStatus $requirementStatus $true
  storiesCovered = Get-ConfidenceFromStatus $storyStatus $true
  uiScreenshotsCovered = Get-ConfidenceFromStatus $uiScreenshotsStatus $visualEnabled
  contractVerified = Get-ConfidenceFromStatus $contractStatus $contractEnabled
  e2eVerified = Get-ConfidenceFromStatus $e2eStatus $integrationEnabled
  manualReviewRemaining = $manualReviewRemainingScore
}
$acceptanceConfidence = [Math]::Round(((
  [double]$confidenceFactors.requirementsCovered +
  [double]$confidenceFactors.storiesCovered +
  [double]$confidenceFactors.uiScreenshotsCovered +
  [double]$confidenceFactors.contractVerified +
  [double]$confidenceFactors.e2eVerified +
  [double]$confidenceFactors.manualReviewRemaining
) / 6.0), 2)
$confidenceDrag = @()
foreach ($factorName in @("requirementsCovered","storiesCovered","uiScreenshotsCovered","contractVerified","e2eVerified","manualReviewRemaining")) {
  $score = [double]$confidenceFactors[$factorName]
  if ($score -lt 1.0) { $confidenceDrag += "$factorName=$score" }
}

$classificationReason = switch ($verdict) {
  "PASS" { "All in-scope P0/P1 requirements, stories, contracts, E2E/full-flow checks, UI evidence, secret guard, and report integrity passed automatically." }
  "PASS_NEEDS_MANUAL_UI_REVIEW" { "Functional verifiers passed or were limited acceptably, but visual or pixel-perfect approval still needs human review." }
  "PASS_WITH_LIMITATION" { "Core acceptance has evidence, but documented limitations remain and prevent a pure automated PASS." }
  "BLOCKED" { "A credential, environment, production-resource, payment, destructive-operation, or other external blocker prevents completion." }
  default { "A HARD_FAIL, FAIL, or IN_SCOPE_GAP remains and prevents final acceptance." }
}
$purePassBlockedBy = @()
if ($verdict -ne "PASS") {
  foreach ($lane in @(
    @{ name="Requirement verifier"; status=$requirementStatus },
    @{ name="Story verifier"; status=$storyStatus },
    @{ name="Contract verifier"; status=$contractStatus },
    @{ name="E2E verifier"; status=$e2eStatus },
    @{ name="DB E2E"; status=$dbStatus },
    @{ name="UI verifier"; status=$uiStatus },
    @{ name="Pixel-perfect visual diff"; status=$pixelPerfectStatus },
    @{ name="Secret guard"; status=$secretStatus },
    @{ name="Report integrity"; status=$reportStatus }
  )) {
    if ($lane.status -ne "PASS" -and $lane.status -ne "DEFERRED" -and $lane.status -ne "DISABLED") {
      $purePassBlockedBy += "$($lane.name) is $($lane.status)"
    }
  }
  if ($reasons.Count -gt 0) {
    $purePassBlockedBy += @($reasons | Select-Object -First 8)
  }
  if ($confidenceDrag.Count -gt 0) {
    $purePassBlockedBy += "acceptance confidence reduced by: $($confidenceDrag -join ', ')"
  }
  $purePassBlockedBy = @($purePassBlockedBy | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) } | Select-Object -Unique)
}
$nonPurePassExplanation = if ($verdict -eq "PASS") {
  "Pure PASS is allowed because all required automated verifier layers passed."
} elseif ($purePassBlockedBy.Count -gt 0) {
  "Pure PASS is not allowed because: $($purePassBlockedBy -join '; ')"
} else {
  "Pure PASS is not allowed because final verdict is $verdict."
}
$whySectionLines = if ($verdict -eq "PASS") {
  @(
    "## Why This Is PASS",
    "",
    "All in-scope P0/P1 requirements, stories, contracts, E2E flows, UI screenshots, report integrity, and secret guard passed with evidence."
  )
} else {
  @(
    "## Why Not Pure PASS?",
    "",
    "Final verdict: $verdict",
    "",
    "- Requirement verifier: $requirementStatus",
    "- Story verifier: $storyStatus",
    "- Contract verifier: $contractStatus",
    "- E2E verifier: $e2eStatus",
    "- DB E2E: $dbStatus",
    "- UI verifier: $uiStatus",
    "- Pixel-perfect evidence: $pixelPerfectStatus",
    "- Secret guard: $secretStatus",
    "- Report integrity: $reportStatus",
    "",
    "Reason:",
    $classificationReason,
    "",
    $nonPurePassExplanation
  )
}

$report = $p.FinalConvergenceReport
@(
  "# Final Convergence Report",
  "",
  "Generated: $(Get-Date)",
  "",
  "- Verdict: $verdict",
  "- Gap list: $(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)",
  "- Machine summary: $(Get-RelativeEvidencePath $ProjectRoot $p.MachineSummary)",
  "",
  "## Final Verdict Classification",
  "",
  "- Final verdict: $verdict",
  "- Verdict class: $verdictClass",
  "- Acceptance confidence: $acceptanceConfidence",
  "- Requirement verifier: $requirementStatus",
  "- Story verifier: $storyStatus",
  "- Contract verifier: $contractStatus",
  "- E2E verifier: $e2eStatus",
  "- DB E2E: $dbStatus",
  "- UI verifier: $uiStatus",
  "- Pixel-perfect visual diff: $pixelPerfectStatus",
  "- UI structure layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.structureStatus } else { 'UNKNOWN' })",
  "- UI screenshot layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.screenshotStatus } else { 'UNKNOWN' })",
  "- UI visual layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.visualStatus } else { 'UNKNOWN' })",
  "- UI pixel-perfect layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.pixelPerfectStatus } else { 'UNKNOWN' })",
  "- Can ship locally: $canShipLocally",
  "- Can claim pixel-perfect: $canClaimPixelPerfect",
  "- Requires human review: $requiresHumanReview",
  "- Final gate suggestions: $($laneSuggestions.Count)",
  "",
  "Meaning: $classificationReason",
  "",
  $whySectionLines,
  "",
  $(if ($verdict -ne "PASS" -and $purePassBlockedBy.Count -gt 0) { $purePassBlockedBy | ForEach-Object { "- $_" } } elseif ($verdict -ne "PASS") { "- No extra pure PASS blockers." } else { "- No pure PASS blockers." }),
  "",
  "## Dynamic Final Gate Suggestions",
  $(if ($laneSuggestions.Count -gt 0) { $laneSuggestions | ForEach-Object { "- $_" } } else { "- No disabled-lane result suggestions." }),
  "",
  "## Reasons",
  $(if ($reasons.Count -gt 0) { $reasons | ForEach-Object { "- $_" } } else { "- No hard/in-scope gaps detected." })
) | Set-Content -Encoding UTF8 $report

Ensure-Dir (Split-Path $p.FinalReport)
if (!(Test-Path -LiteralPath $p.FinalReport)) {
  "# AUTO EXECUTE DELIVERY REPORT`r`n`r`nGenerated: $(Get-Date)`r`n" | Set-Content -Encoding UTF8 $p.FinalReport
}
$finalReportText = Get-Content -LiteralPath $p.FinalReport -Raw
$whySectionText = ($whySectionLines -join "`r`n")
$classificationSection = @(
  "## Final Verdict Classification",
  "",
  "Final verdict: $verdict",
  "",
  "Reason:",
  "- Requirement verifier: $requirementStatus",
  "- Story verifier: $storyStatus",
  "- Contract verifier: $contractStatus",
  "- E2E verifier: $e2eStatus",
  "- DB E2E: $dbStatus",
  "- UI verifier: $uiStatus",
  "- Pixel-perfect visual diff: $pixelPerfectStatus",
  "- Acceptance confidence: $acceptanceConfidence",
  "- Secret guard: $secretStatus",
  "- Report integrity: $reportStatus",
  "- UI structure layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.structureStatus } else { 'UNKNOWN' })",
  "- UI screenshot layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.screenshotStatus } else { 'UNKNOWN' })",
  "- UI visual layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.visualStatus } else { 'UNKNOWN' })",
  "- UI pixel-perfect layer: $(if ($null -ne $uiLayerSummary) { $uiLayerSummary.pixelPerfectStatus } else { 'UNKNOWN' })",
  "",
  "This means:",
  $classificationReason,
  "",
  "- Verdict class: $verdictClass",
  "- Acceptance confidence: $acceptanceConfidence",
  "- Can ship locally: $canShipLocally",
  "- Can claim pixel-perfect: $canClaimPixelPerfect",
  "- Requires human review: $requiresHumanReview"
  "",
  $whySectionText
) -join "`r`n"
$classificationPattern = "(?ms)^## Final Verdict Classification\s+.*?(?=^## |\z)(?:^## Why (?:Not Pure PASS\?|This Is PASS)\s+.*?(?=^## |\z))?"
if ($finalReportText -match $classificationPattern) {
  $finalReportText = [regex]::Replace($finalReportText, $classificationPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $classificationSection })
} else {
  $finalReportText = $finalReportText.TrimEnd() + "`r`n`r`n" + $classificationSection + "`r`n"
}
$finalReportText | Set-Content -Encoding UTF8 $p.FinalReport

@{
  schemaVersion = $AE_SCHEMA_VERSION
  status = $verdict
  currentRound = Get-CurrentConvergenceRound $ProjectRoot
  strict = [bool]$Strict
  finalVerdict = $verdict
  lastGapCount = $hardGaps.Count
  updatedAt = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState

$laneStatus = if ($verdict -in @("HARD_FAIL","FAIL")) { "HARD_FAIL" } elseif ($verdict -eq "BLOCKED") { "BLOCKED" } elseif ($verdict -eq "PASS_NEEDS_MANUAL_UI_REVIEW") { "PASS_NEEDS_MANUAL_UI_REVIEW" } elseif ($verdict -eq "PASS_WITH_LIMITATION") { "PASS_WITH_LIMITATION" } else { "PASS" }
Write-LaneResult $ProjectRoot "final-gate" $laneStatus @() @((Get-RelativeEvidencePath $ProjectRoot $report),(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson),(Get-RelativeEvidencePath $ProjectRoot $p.MachineSummary)) $reasons @()
try { $summary = Get-Content -LiteralPath $p.MachineSummary -Raw | ConvertFrom-Json } catch { $summary = [PSCustomObject]@{} }
$summary | Add-Member -NotePropertyName finalVerdict -NotePropertyValue $verdict -Force
$summary | Add-Member -NotePropertyName hardFails -NotePropertyValue @($summaryHardFails) -Force
$summary | Add-Member -NotePropertyName documentedBlockers -NotePropertyValue @($summaryDocumented) -Force
$summary | Add-Member -NotePropertyName manualReviewRequired -NotePropertyValue @($summaryManual) -Force
$summary | Add-Member -NotePropertyName deferred -NotePropertyValue @($summaryDeferred) -Force
$summary | Add-Member -NotePropertyName verdictClass -NotePropertyValue $verdictClass -Force
$summary | Add-Member -NotePropertyName requirementStatus -NotePropertyValue $requirementStatus -Force
$summary | Add-Member -NotePropertyName storyStatus -NotePropertyValue $storyStatus -Force
$summary | Add-Member -NotePropertyName contractStatus -NotePropertyValue $contractStatus -Force
$summary | Add-Member -NotePropertyName e2eStatus -NotePropertyValue $e2eStatus -Force
$summary | Add-Member -NotePropertyName uiStatus -NotePropertyValue $uiStatus -Force
$summary | Add-Member -NotePropertyName secretStatus -NotePropertyValue $secretStatus -Force
$summary | Add-Member -NotePropertyName reportStatus -NotePropertyValue $reportStatus -Force
$summary | Add-Member -NotePropertyName uiLayerSummary -NotePropertyValue $uiLayerSummary -Force
$summary | Add-Member -NotePropertyName pixelPerfectStatus -NotePropertyValue $pixelPerfectStatus -Force
$summary | Add-Member -NotePropertyName canShipLocally -NotePropertyValue ([bool]$canShipLocally) -Force
$summary | Add-Member -NotePropertyName canClaimPixelPerfect -NotePropertyValue ([bool]$canClaimPixelPerfect) -Force
$summary | Add-Member -NotePropertyName requiresHumanReview -NotePropertyValue ([bool]$requiresHumanReview) -Force
$summary | Add-Member -NotePropertyName acceptanceConfidence -NotePropertyValue $acceptanceConfidence -Force
$summary | Add-Member -NotePropertyName confidenceFactors -NotePropertyValue $confidenceFactors -Force
$summary | Add-Member -NotePropertyName confidenceDrag -NotePropertyValue $confidenceDrag -Force
$summary | Add-Member -NotePropertyName finalGateSuggestions -NotePropertyValue $laneSuggestions -Force
$summary | Add-Member -NotePropertyName verdictClassificationReason -NotePropertyValue $classificationReason -Force
$summary | Add-Member -NotePropertyName purePassBlockedBy -NotePropertyValue $purePassBlockedBy -Force
$summary | Add-Member -NotePropertyName nonPurePassExplanation -NotePropertyValue $nonPurePassExplanation -Force
$summary | Add-Member -NotePropertyName schemaVersion -NotePropertyValue $AE_SCHEMA_VERSION -Force
$summary | Add-Member -NotePropertyName finalReport -NotePropertyValue (Get-RelativeEvidencePath $ProjectRoot $report) -Force
$summary | Add-Member -NotePropertyName nextRecommendedAction -NotePropertyValue $(if ($verdict -eq "PASS") { "Ready for final human acceptance." } elseif ($verdict -eq "PASS_NEEDS_MANUAL_UI_REVIEW") { "Manual UI review is required before treating this as fully accepted." } elseif ($verdict -eq "PASS_WITH_LIMITATION") { "Review limitations before final acceptance." } elseif ($verdict -eq "BLOCKED") { "Resolve documented blocker, then rerun final gate." } else { "Read final-convergence-report.md, gap-list.json, and next-agent-action.md; repair failed hard gates before final acceptance." }) -Force
$summary | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToString("s") -Force
$summary | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.MachineSummary
Add-VerificationResult $ProjectRoot "final-gate" $laneStatus "Final verdict: $verdict" $report
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "final gate verdict written"
Write-Host "[$laneStatus] final-gate: $verdict"
exit (Get-AEExitCode $verdict)
