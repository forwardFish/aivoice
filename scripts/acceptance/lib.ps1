param()

$AE_SCHEMA_VERSION = "2.0"
$AE_STATUSES = @(
  "PASS",
  "PASS_WITH_LIMITATION",
  "PASS_NEEDS_MANUAL_UI_REVIEW",
  "REPAIR_REQUIRED",
  "FAIL",
  "HARD_FAIL",
  "BLOCKED",
  "IN_SCOPE_GAP",
  "DOCUMENTED_BLOCKER",
  "BLOCKED_BY_ENVIRONMENT",
  "DEFERRED",
  "MANUAL_REVIEW_REQUIRED",
  "PRODUCT_DECISION_REQUIRED",
  "PENDING"
)

function Get-AEExitCode($Status) {
  switch ($Status) {
    "PASS" { return 0 }
    "PASS_WITH_LIMITATION" { return 3 }
    "PASS_NEEDS_MANUAL_UI_REVIEW" { return 3 }
    "REPAIR_REQUIRED" { return 2 }
    "BLOCKED" { return 4 }
    "DOCUMENTED_BLOCKER" { return 4 }
    "BLOCKED_BY_ENVIRONMENT" { return 4 }
    default { return 1 }
  }
}

function Normalize-AEVerdict($Status) {
  switch ($Status) {
    "FAILED" { return "HARD_FAIL" }
    "COMPLETE" { return "PASS_WITH_LIMITATION" }
    "COMPLETED" { return "PASS_WITH_LIMITATION" }
    "VISUAL_PASS_WITH_MANUAL_REVIEW" { return "PASS_NEEDS_MANUAL_UI_REVIEW" }
    default {
      if ($AE_STATUSES -contains $Status) { return $Status }
      return "HARD_FAIL"
    }
  }
}

function Test-AERegex($Text, [string]$Pattern) {
  if ([string]::IsNullOrWhiteSpace([string]$Text)) { return $false }
  return ([string]$Text) -match $Pattern
}

function Test-AERequirementIntentText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  if ($Text -match '(?i)\b(must|should|required|requirement|acceptance|feature|function|user can|system (can|should|must|generates?|provides?|creates?|supports?)|generates?|uploads?|creates?|saves?|shares?|exports?|provides?)\b') { return $true }
  $actorOrDomain = '\u7528\u6237|\u7cfb\u7edf|\u7ba1\u7406\u5458|\u8fd0\u8425|\u5ba2\u6237|\u5b66\u751f|\u8001\u5e08|\u6559\u5e08|\u8bbf\u5ba2|\u4f1a\u5458|\u529f\u80fd|\u9875\u9762|\u63a5\u53e3|\u9a8c\u6536|\u62a5\u544a|\u4e3b\u6d41\u7a0b|\u95ed\u73af'
  $actionOrModal = '\u53ef\u4ee5|\u80fd\u591f|\u9700\u8981|\u5fc5\u987b|\u5e94\u5f53|\u652f\u6301|\u521b\u5efa|\u4e0a\u4f20|\u751f\u6210|\u67e5\u770b|\u7f16\u8f91|\u5220\u9664|\u5bfc\u51fa|\u5206\u4eab|\u652f\u4ed8|\u767b\u5f55|\u63d0\u4ea4|\u5f00\u59cb|\u6253\u5f00|\u4fdd\u5b58|\u8fdb\u5165|\u9009\u62e9|\u914d\u7f6e|\u7ba1\u7406|\u5c55\u793a|\u8bc6\u522b|\u5ba1\u6838|\u641c\u7d22|\u8fc7\u6ee4|\u6392\u5e8f|\u4e0b\u8f7d'
  return ((Test-AERegex $Text $actorOrDomain) -and (Test-AERegex $Text $actionOrModal))
}

function Test-AEStoryIntentText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  if ($Text -match '(?i)(user can|as a |system should|admin can|after |when |supports?|allows?|generates?|uploads?|creates?|saves?|shares?|exports?|pays?)') { return $true }
  if ($Text -match '(/[A-Za-z0-9_\-\[\]\{\}/]+)') { return $true }
  $actor = '\u7528\u6237|\u7cfb\u7edf|\u7ba1\u7406\u5458|\u8fd0\u8425|\u5ba2\u6237|\u5b66\u751f|\u8001\u5e08|\u6559\u5e08|\u8bbf\u5ba2|\u4f1a\u5458'
  $action = '\u53ef\u4ee5|\u80fd\u591f|\u9700\u8981|\u5fc5\u987b|\u5e94\u5f53|\u652f\u6301|\u521b\u5efa|\u4e0a\u4f20|\u751f\u6210|\u67e5\u770b|\u7f16\u8f91|\u5220\u9664|\u5bfc\u51fa|\u5206\u4eab|\u652f\u4ed8|\u767b\u5f55|\u63d0\u4ea4|\u5f00\u59cb|\u6253\u5f00|\u4fdd\u5b58|\u8fdb\u5165|\u9009\u62e9|\u914d\u7f6e|\u7ba1\u7406|\u5c55\u793a|\u8bc6\u522b|\u5ba1\u6838|\u641c\u7d22|\u8fc7\u6ee4|\u6392\u5e8f|\u4e0b\u8f7d'
  return ((Test-AERegex $Text $actor) -and (Test-AERegex $Text $action))
}

function Get-AETextPriority([string]$Text) {
  if ($Text -match '(?i)\bP0\b|must|required|critical|core|\u5fc5\u987b|\u5fc5\u8981|\u6838\u5fc3|\u5173\u952e|\u9a8c\u6536|\u4e3b\u6d41\u7a0b|\u95ed\u73af') { return "P0" }
  if ($Text -match '(?i)\bP1\b|should|important|user can|system (can|should|generates?|provides?|creates?|supports?)|\u9700\u8981|\u9875\u9762|\u63a5\u53e3|\u529f\u80fd|\u7528\u6237|\u7cfb\u7edf') { return "P1" }
  return "P2"
}

function Test-AEFullFlowText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  return ($Text -match '(?i)full[- ]?flow|end[- ]?to[- ]?end|e2e|\u5b8c\u6574\u6d41\u7a0b|\u5168\u6d41\u7a0b|\u7aef\u5230\u7aef|\u95ed\u73af')
}

function Test-AEEnvironmentFailureText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  $pattern = '(?i)ECONNREFUSED|EADDRINUSE|ENOTFOUND|ETIMEDOUT|timeout|timed out|connection refused|port .*in use|base url did not become reachable|Cannot find module|module not found|command not found|is not recognized|No such file or directory|playwright.*install|browser.*install|docker.*daemon|docker.*not|permission denied|EPERM|EACCES|certificate|network|unable to connect|localhost|127\.0\.0\.1'
  return ($Text -match $pattern)
}

function Ensure-Dir($Path) {
  if (!(Test-Path $Path)) { New-Item -ItemType Directory -Force -Path $Path | Out-Null }
}

function Get-ProjectRoot($ProjectRoot) {
  if ([string]::IsNullOrWhiteSpace($ProjectRoot)) { return (Resolve-Path ".").Path }
  return (Resolve-Path $ProjectRoot).Path
}

function Get-AEPaths($ProjectRoot) {
  $ProjectRoot = Get-ProjectRoot $ProjectRoot
  $Docs = Join-Path $ProjectRoot "docs\auto-execute"
  return @{
    ProjectRoot = $ProjectRoot
    HarnessConfig = Join-Path $ProjectRoot "harness.yml"
    Docs = $Docs
    Runs = Join-Path $Docs "runs"
    Latest = Join-Path $Docs "latest"
    Index = Join-Path $Docs "index.md"
    Features = Join-Path $Docs "features"
    Tasks = Join-Path $Docs "tasks"
    Logs = Join-Path $Docs "logs"
    Results = Join-Path $Docs "results"
    Screenshots = Join-Path $Docs "screenshots"
    Summaries = Join-Path $Docs "summaries"
    Generated = Join-Path $ProjectRoot "scripts\acceptance\generated"
    MetaTests = Join-Path $Docs "meta-tests"
    MetaTestFixtures = Join-Path $Docs "meta-tests\fixtures"
    Verification = Join-Path $Docs "verification-results.md"
    Blockers = Join-Path $Docs "blockers.md"
    State = Join-Path $Docs "state.json"
    Progress = Join-Path $Docs "progress.md"
    EvidenceManifest = Join-Path $Docs "evidence-manifest.json"
    MachineSummary = Join-Path $Docs "machine-summary.json"
    RepairAttempts = Join-Path $Docs "repair-attempts.json"
    AcceptanceGoal = Join-Path $Docs "acceptance-goal.json"
    RequirementCandidates = Join-Path $Docs "requirement-candidates.json"
    RequirementTarget = Join-Path $Docs "requirement-target.json"
    RequirementSectionMap = Join-Path $Docs "requirement-section-map.json"
    EpicMap = Join-Path $Docs "epic-map.json"
    SprintPlan = Join-Path $Docs "sprint-plan.json"
    StoryCandidates = Join-Path $Docs "story-candidates.json"
    StoryCandidatesCurated = Join-Path $Docs "story-candidates-curated.json"
    StoryTarget = Join-Path $Docs "story-target.json"
    StoryTestMatrix = Join-Path $Docs "story-test-matrix.json"
    StoryStatus = Join-Path $Docs "story-status.json"
    StoryMaterializedTests = Join-Path $Docs "story-materialized-tests.json"
    StoryQualityGate = Join-Path $Docs "story-quality-gate.json"
    StoryAcceptanceSummary = Join-Path $Docs "story-acceptance-summary.json"
    StoryGapList = Join-Path $Docs "story-gap-list.json"
    HarnessScorecard = Join-Path $Docs "harness-scorecard.json"
    HarnessGapList = Join-Path $Docs "harness-gap-list.json"
    HarnessRepairPlan = Join-Path $Docs "harness-repair-plan.md"
    HarnessSelfEvalReport = Join-Path $Docs "harness-self-eval-report.md"
    UiCandidates = Join-Path $Docs "ui-candidates.json"
    UiTarget = Join-Path $Docs "ui-target.json"
    SurfaceTarget = Join-Path $Docs "surface-target.json"
    ContractMapJson = Join-Path $Docs "contract-map.json"
    TestMatrixJson = Join-Path $Docs "test-matrix.json"
    GapListJson = Join-Path $Docs "gap-list.json"
    GapListMd = Join-Path $Docs "gap-list.md"
    RepairPlan = Join-Path $Docs "repair-plan.md"
    NextAgentAction = Join-Path $Docs "next-agent-action.md"
    GapClosureLog = Join-Path $Docs "gap-closure-log.md"
    ConvergenceState = Join-Path $Docs "convergence-state.json"
    ConvergenceRounds = Join-Path $Docs "convergence-rounds"
    Comparison = Join-Path $Docs "comparison"
    FinalConvergenceReport = Join-Path $Docs "final-convergence-report.md"
    VisualDiffReport = Join-Path $Docs "visual-diff-report.md"
    FinalReport = Join-Path $ProjectRoot "docs\AUTO_EXECUTE_DELIVERY_REPORT.md"
  }
}

function Initialize-Layout($ProjectRoot) {
  $p = Get-AEPaths $ProjectRoot
  @(
    $p.Docs, $p.Runs, $p.Latest, $p.Features, $p.Logs, $p.Results, $p.Screenshots, $p.Summaries, $p.ConvergenceRounds, $p.Comparison, $p.Generated, $p.MetaTests, $p.MetaTestFixtures,
    (Join-Path $p.Tasks "available"),
    (Join-Path $p.Tasks "current"),
    (Join-Path $p.Tasks "completed"),
    (Join-Path $p.Tasks "blocked")
  ) | ForEach-Object { Ensure-Dir $_ }
  if (!(Test-Path -LiteralPath $p.Index)) {
    "# Auto Execute Index`n`n- latest handoff: latest/HANDOFF.md`n- latest run id: latest/run-id.txt`n- runs: runs/`n" | Set-Content -Encoding UTF8 $p.Index
  }
}

function Initialize-MachineFiles($ProjectRoot) {
  $p = Get-AEPaths $ProjectRoot
  Ensure-Dir $p.Results
  if (!(Test-Path -LiteralPath $p.EvidenceManifest)) {
    @{
      schemaVersion = $AE_SCHEMA_VERSION
      screenshots = @()
      logs = @()
      testReports = @()
      apiResults = @()
      visualResults = @()
      finalReports = @()
      other = @()
    } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.EvidenceManifest
  }
  if (!(Test-Path -LiteralPath $p.MachineSummary)) {
    @{
      schemaVersion = $AE_SCHEMA_VERSION
      finalVerdict = "PENDING"
      hardFails = @()
      documentedBlockers = @()
      manualReviewRequired = @()
      deferred = @()
      nextRecommendedAction = ""
      updatedAt = (Get-Date).ToString("s")
    } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.MachineSummary
  }
  if (!(Test-Path -LiteralPath $p.RepairAttempts)) {
    @{} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.RepairAttempts
  }
  if (!(Test-Path -LiteralPath $p.GapListJson)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; round = 0; generatedAt = (Get-Date).ToString("s"); gaps = @() } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.GapListJson
  }
  if (!(Test-Path -LiteralPath $p.UiCandidates)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; candidates = @(); generatedAt = (Get-Date).ToString("s"); status = "EMPTY" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.UiCandidates
  }
  if (!(Test-Path -LiteralPath $p.RequirementSectionMap)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; sections = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING"; note = "PRD section coverage map. P0/P1 sections need requirement and story coverage before final PASS." } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.RequirementSectionMap
  }
  if (!(Test-Path -LiteralPath $p.EpicMap)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; epics = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.EpicMap
  }
  if (!(Test-Path -LiteralPath $p.SprintPlan)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; sprints = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.SprintPlan
  }
  if (!(Test-Path -LiteralPath $p.StoryCandidates)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; candidates = @(); generatedAt = (Get-Date).ToString("s"); status = "EMPTY"; note = "Story candidates are not accepted stories. Normalize into story-target.json before final PASS." } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryCandidates
  }
  if (!(Test-Path -LiteralPath $p.StoryCandidatesCurated)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; items = @(); summary = @{}; generatedAt = (Get-Date).ToString("s"); status = "EMPTY"; note = "Curated story candidates determine which candidates can enter normalization." } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryCandidatesCurated
  }
  if (!(Test-Path -LiteralPath $p.StoryTarget)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; stories = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING"; note = "P0/P1 stories need acceptanceCriteria, testPoints, and existing evidence before final PASS." } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryTarget
  }
  if (!(Test-Path -LiteralPath $p.StoryTestMatrix)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; testPoints = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryTestMatrix
  }
  if (!(Test-Path -LiteralPath $p.StoryStatus)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; stories = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryStatus
  }
  if (!(Test-Path -LiteralPath $p.StoryMaterializedTests)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; stories = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING"; note = "P0/P1 story test points must be generated, bound, manual-review, or deferred." } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryMaterializedTests
  }
  if (!(Test-Path -LiteralPath $p.StoryQualityGate)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; lane = "story-quality-gate"; status = "PENDING"; failedStories = @(); generatedAt = (Get-Date).ToString("s") } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryQualityGate
  }
  if (!(Test-Path -LiteralPath $p.StoryAcceptanceSummary)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; status = "PENDING"; stories = @(); generatedAt = (Get-Date).ToString("s") } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryAcceptanceSummary
  }
  if (!(Test-Path -LiteralPath $p.StoryGapList)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; gaps = @(); generatedAt = (Get-Date).ToString("s") } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.StoryGapList
  }
  if (!(Test-Path -LiteralPath $p.HarnessScorecard)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; totalScore = 0; verdict = "NOT_EVALUATED"; categories = @{}; generatedAt = (Get-Date).ToString("s") } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.HarnessScorecard
  }
  if (!(Test-Path -LiteralPath $p.HarnessGapList)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; gaps = @(); generatedAt = (Get-Date).ToString("s") } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.HarnessGapList
  }
  if (!(Test-Path -LiteralPath $p.HarnessRepairPlan)) {
    "# Harness Repair Plan`n`nNo harness self-evaluation has run yet.`n" | Set-Content -Encoding UTF8 $p.HarnessRepairPlan
  }
  if (!(Test-Path -LiteralPath $p.HarnessSelfEvalReport)) {
    "# Harness Self-Evaluation Report`n`nPending self-evaluation.`n" | Set-Content -Encoding UTF8 $p.HarnessSelfEvalReport
  }
  if (!(Test-Path -LiteralPath $p.ContractMapJson)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; frontendCalls = @(); apiDefinitions = @(); contracts = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ContractMapJson
  }
  if (!(Test-Path -LiteralPath $p.TestMatrixJson)) {
    @{ schemaVersion = $AE_SCHEMA_VERSION; tests = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING" } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.TestMatrixJson
  }
  if (!(Test-Path -LiteralPath $p.ConvergenceState)) {
    @{
      schemaVersion = $AE_SCHEMA_VERSION
      status = "PENDING"
      currentRound = 0
      maxRounds = 5
      lastGapCount = 0
      finalVerdict = "PENDING"
      updatedAt = (Get-Date).ToString("s")
    } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState
  }
}

function Set-MachineSummaryRepairRequired($ProjectRoot, $GapCount, $RepairPlan, $NextAgentAction) {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  try { $summary = Get-Content -LiteralPath $p.MachineSummary -Raw | ConvertFrom-Json } catch { $summary = [PSCustomObject]@{} }
  $summary | Add-Member -NotePropertyName finalVerdict -NotePropertyValue "REPAIR_REQUIRED" -Force
  $summary | Add-Member -NotePropertyName schemaVersion -NotePropertyValue $AE_SCHEMA_VERSION -Force
  $summary | Add-Member -NotePropertyName repairRequired -NotePropertyValue $true -Force
  $summary | Add-Member -NotePropertyName lastGapCount -NotePropertyValue $GapCount -Force
  $summary | Add-Member -NotePropertyName repairPlan -NotePropertyValue (Get-RelativeEvidencePath $ProjectRoot $RepairPlan) -Force
  $summary | Add-Member -NotePropertyName nextAgentAction -NotePropertyValue (Get-RelativeEvidencePath $ProjectRoot $NextAgentAction) -Force
  $summary | Add-Member -NotePropertyName nextRecommendedAction -NotePropertyValue "Read docs/auto-execute/next-agent-action.md and docs/auto-execute/repair-plan.md, fix the listed implementation/test/evidence gaps, then rerun run-convergence.ps1." -Force
  $summary | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToString("s") -Force
  $summary | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.MachineSummary
}

function Reset-ConvergenceState($ProjectRoot, $MaxRounds) {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  Reset-GapList $ProjectRoot 0
  @{
    schemaVersion = $AE_SCHEMA_VERSION
    status = "PENDING"
    currentRound = 0
    maxRounds = $MaxRounds
    lastGapCount = 0
    finalVerdict = "PENDING"
    resetAt = (Get-Date).ToString("s")
    updatedAt = (Get-Date).ToString("s")
  } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.ConvergenceState
  @{
    schemaVersion = $AE_SCHEMA_VERSION
    finalVerdict = "PENDING"
    hardFails = @()
    documentedBlockers = @()
    manualReviewRequired = @()
    deferred = @()
    repairRequired = $false
    nextRecommendedAction = "Run convergence from round 1."
    updatedAt = (Get-Date).ToString("s")
  } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.MachineSummary
}

function Get-RelativeEvidencePath($ProjectRoot, $Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
  try {
    $root = (Get-ProjectRoot $ProjectRoot).TrimEnd('\') + '\'
    $full = [System.IO.Path]::GetFullPath($Path)
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $full.Substring($root.Length)
    }
    return $full
  } catch { return $Path }
}

function Add-GapClosureLog($ProjectRoot, $ClosedGaps, $Round) {
  if (@($ClosedGaps).Count -eq 0) { return }
  $p = Get-AEPaths $ProjectRoot
  Ensure-Dir (Split-Path $p.GapClosureLog)
  if (!(Test-Path -LiteralPath $p.GapClosureLog)) {
    "# Gap Closure Log`n`n| Time | Round | Gap ID | Type | Severity | Closure basis | Evidence |`n|---|---|---|---|---|---|---|`n" | Set-Content -Encoding UTF8 $p.GapClosureLog
  }
  foreach ($gap in @($ClosedGaps)) {
    $basis = "Gap did not reappear as an open HARD_FAIL/IN_SCOPE_GAP in the latest comparison round."
    Add-Content -Encoding UTF8 $p.GapClosureLog "| $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') | $Round | $($gap.id) | $($gap.type) | $($gap.severity) | $basis | $(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson) |"
  }
  Add-EvidenceItem $ProjectRoot "other" $p.GapClosureLog "gap closure log"
}

function Add-EvidenceItem($ProjectRoot, $Type, $Path, $Label = "") {
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  try { $manifest = Get-Content -LiteralPath $p.EvidenceManifest -Raw | ConvertFrom-Json } catch { $manifest = $null }
  if ($null -eq $manifest) {
    $manifest = [PSCustomObject]@{ screenshots=@(); logs=@(); testReports=@(); apiResults=@(); visualResults=@(); finalReports=@(); other=@() }
  }
  $item = [PSCustomObject]@{
    path = Get-RelativeEvidencePath $ProjectRoot $Path
    label = $Label
    addedAt = (Get-Date).ToString("s")
    exists = (Test-Path -LiteralPath $Path)
  }
  $bucket = switch ($Type) {
    "screenshot" { "screenshots" }
    "log" { "logs" }
    "test" { "testReports" }
    "api" { "apiResults" }
    "visual" { "visualResults" }
    "final" { "finalReports" }
    default { "other" }
  }
  $items = @($manifest.$bucket)
  $items += $item
  $manifest | Add-Member -NotePropertyName $bucket -NotePropertyValue $items -Force
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.EvidenceManifest
}

function Write-LaneResult($ProjectRoot, $Lane, $Status, $Commands = @(), $Evidence = @(), $Blockers = @(), $NextActions = @()) {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  $file = Join-Path $p.Results "$Lane.json"
  $Status = Normalize-AEVerdict $Status
  $obj = @{
    schemaVersion = $AE_SCHEMA_VERSION
    lane = $Lane
    status = $Status
    updatedAt = (Get-Date).ToString("s")
    commands = @($Commands)
    evidence = @($Evidence)
    blockers = @($Blockers)
    nextActions = @($NextActions)
  }
  $obj | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $file
  Add-EvidenceItem $ProjectRoot "other" $file "$Lane result"
}

function Update-MachineSummary($ProjectRoot) {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  $hardFails = @()
  $documentedBlockers = @()
  $manual = @()
  $deferred = @()
  foreach ($file in Get-ChildItem -LiteralPath $p.Results -Filter *.json -ErrorAction SilentlyContinue) {
    try { $r = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json } catch { continue }
    if ([string]::IsNullOrWhiteSpace([string]$r.lane)) { continue }
    if ($r.lane -in @("final-gate","run-all","gap-repair","repair")) { continue }
    $status = Normalize-AEVerdict $r.status
    $entry = @{ lane=$r.lane; status=$status; file=(Get-RelativeEvidencePath $ProjectRoot $file.FullName); blockers=@($r.blockers) }
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
  $verdict = "PASS"
  if ($hardFails.Count -gt 0) { $verdict = "HARD_FAIL" }
  elseif ($documentedBlockers.Count -gt 0 -or $manual.Count -gt 0 -or $deferred.Count -gt 0) { $verdict = "PASS_WITH_LIMITATION" }
  $summary = @{
    schemaVersion = $AE_SCHEMA_VERSION
    finalVerdict = $verdict
    hardFails = $hardFails
    documentedBlockers = $documentedBlockers
    manualReviewRequired = $manual
    deferred = $deferred
    nextRecommendedAction = $(if ($verdict -eq "PASS") { "Ready for human acceptance." } else { "Review blockers and manual/deferred lanes before final acceptance." })
    updatedAt = (Get-Date).ToString("s")
  }
  $summary | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.MachineSummary
}

function Reset-GapList($ProjectRoot, $Round) {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  @{ schemaVersion = $AE_SCHEMA_VERSION; round = $Round; generatedAt = (Get-Date).ToString("s"); gaps = @() } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.GapListJson
  "# Gap List`n`nRound: $Round`n`n" | Set-Content -Encoding UTF8 $p.GapListMd
}

function Add-Gap($ProjectRoot, $Round, $Id, $Type, $Severity, $Description, $RepairTarget, $Source = "") {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  try { $gapList = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json } catch { $gapList = $null }
  if ($null -eq $gapList -or $gapList.round -ne $Round) {
    Reset-GapList $ProjectRoot $Round
    $gapList = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json
  }
  $gap = [PSCustomObject]@{
    id = $Id
    type = $Type
    severity = $Severity
    source = $Source
    description = $Description
    repairTarget = $RepairTarget
    status = "OPEN"
  }
  $gaps = @($gapList.gaps)
  $gaps += $gap
  $gapList | Add-Member -NotePropertyName gaps -NotePropertyValue $gaps -Force
  $gapList | Add-Member -NotePropertyName generatedAt -NotePropertyValue (Get-Date).ToString("s") -Force
  $gapList | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.GapListJson
  Add-Content -Encoding UTF8 $p.GapListMd "- [$Severity] $Id ($Type): $Description Repair: $RepairTarget"
}

function Get-CurrentConvergenceRound($ProjectRoot) {
  $p = Get-AEPaths $ProjectRoot
  try {
    $state = Get-Content -LiteralPath $p.ConvergenceState -Raw | ConvertFrom-Json
    if ($null -ne $state.currentRound -and [int]$state.currentRound -gt 0) { return [int]$state.currentRound }
  } catch {}
  return 1
}

function Get-HarnessConfigValue($ProjectRoot, $Section, $Key, $Default = "") {
  $p = Get-AEPaths $ProjectRoot
  if (!(Test-Path -LiteralPath $p.HarnessConfig)) { return $Default }
  $lines = Get-Content -LiteralPath $p.HarnessConfig
  $inSection = $false
  foreach ($line in $lines) {
    if ($line -match "^\s*$Section\s*:\s*$") { $inSection = $true; continue }
    if ($inSection -and $line -match "^\S") { $inSection = $false }
    if ($inSection -and $line -match "^\s{2}$Key\s*:\s*(.+?)\s*$") {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $Default
}

function Get-HarnessBoolValue($ProjectRoot, $Section, $Key, [bool]$Default = $false) {
  $value = Get-HarnessConfigValue $ProjectRoot $Section $Key $(if ($Default) { "true" } else { "false" })
  return ($value -match "^(?i:true|yes|1)$")
}

function Get-HarnessListValue($ProjectRoot, $Section, $Key) {
  $p = Get-AEPaths $ProjectRoot
  if (!(Test-Path -LiteralPath $p.HarnessConfig)) { return @() }
  $lines = Get-Content -LiteralPath $p.HarnessConfig
  $inSection = $false
  $inKey = $false
  $values = @()
  foreach ($line in $lines) {
    if ($line -match "^\s*$Section\s*:\s*$") { $inSection = $true; $inKey = $false; continue }
    if ($inSection -and $line -match "^\S") { $inSection = $false; $inKey = $false }
    if (!$inSection) { continue }
    if ($line -match "^\s{2}$Key\s*:\s*\[(.*)\]\s*$") {
      $inline = $Matches[1].Trim()
      if (![string]::IsNullOrWhiteSpace($inline)) {
        return @($inline.Split(",") | ForEach-Object { $_.Trim().Trim('"').Trim("'") } | Where-Object { $_ })
      }
      return @()
    }
    if ($line -match "^\s{2}$Key\s*:\s*$") { $inKey = $true; continue }
    if ($inKey -and $line -match "^\s{2}\S") { $inKey = $false }
    if ($inKey -and $line -match "^\s{4}-\s*(.+?)\s*$") {
      $values += $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

function Get-HarnessObjectListValue($ProjectRoot, $Section) {
  $p = Get-AEPaths $ProjectRoot
  if (!(Test-Path -LiteralPath $p.HarnessConfig)) { return @() }
  $lines = Get-Content -LiteralPath $p.HarnessConfig
  $inSection = $false
  $objects = @()
  $current = $null
  foreach ($line in $lines) {
    if ($line -match "^\s*$Section\s*:\s*$") {
      $inSection = $true
      continue
    }
    if ($inSection -and $line -match "^\S") {
      if ($null -ne $current) { $objects += [PSCustomObject]$current; $current = $null }
      $inSection = $false
    }
    if (-not $inSection) { continue }
    if ($line -match "^\s{2}-\s*(\w+)\s*:\s*(.*?)\s*$") {
      if ($null -ne $current) { $objects += [PSCustomObject]$current }
      $current = @{}
      $current[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
      continue
    }
    if ($line -match "^\s{4}(\w+)\s*:\s*(.*?)\s*$") {
      if ($null -eq $current) { $current = @{} }
      $value = $Matches[2].Trim().Trim('"').Trim("'")
      if ($value -match "^(?i:true|false)$") { $current[$Matches[1]] = ($value -match "^(?i:true)$") }
      else { $current[$Matches[1]] = $value }
    }
  }
  if ($inSection -and $null -ne $current) { $objects += [PSCustomObject]$current }
  return @($objects)
}

function Resolve-ProjectEvidencePath($ProjectRoot, $Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
  $candidate = $Path
  if ($candidate -match "^\[MISSING\]") { return $candidate }
  if (-not [System.IO.Path]::IsPathRooted($candidate)) {
    $candidate = Join-Path $ProjectRoot $candidate
  }
  try { return [System.IO.Path]::GetFullPath($candidate) } catch { return $candidate }
}

function Test-ProjectEvidencePath($ProjectRoot, $Path) {
  $resolved = Resolve-ProjectEvidencePath $ProjectRoot $Path
  if ([string]::IsNullOrWhiteSpace($resolved)) { return $false }
  if ($resolved -match "^\[MISSING\]") { return $false }
  return (Test-Path -LiteralPath $resolved)
}

function Test-AEIgnoredRequirementPath($ProjectRoot, $Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $true }
  $rel = Get-RelativeEvidencePath $ProjectRoot $Path
  $norm = ([string]$rel).Replace("\", "/").ToLowerInvariant()
  if ($norm -match '(^|/)docs/auto-execute/') { return $true }
  if ($norm -match '(^|/)docs/_secondary(/|$)') { return $true }
  if ($norm -match '(^|/)docs/.*/backup(/|$)|(^|/)docs/backup(/|$)') { return $true }
  if ($norm -match '(^|/)docs/.*/old-prds(/|$)|(^|/)docs/old-prds(/|$)') { return $true }
  if ($norm -match '(^|/)docs/.*/reports(/|$)|(^|/)docs/reports(/|$)') { return $true }
  if ($norm -match '(^|/)docs/.*/archive(/|$)|(^|/)docs/archive(/|$)') { return $true }
  if ([System.IO.Path]::GetFileName($Path) -eq "AUTO_EXECUTE_DELIVERY_REPORT.md") { return $true }
  return $false
}

function Get-AERequirementSourceFiles($ProjectRoot) {
  $files = @()
  foreach ($item in (Get-HarnessListValue $ProjectRoot "docs" "requirements")) {
    $candidate = Resolve-ProjectEvidencePath $ProjectRoot $item
    if (!(Test-Path -LiteralPath $candidate)) { continue }
    $resolved = Get-Item -LiteralPath $candidate
    if ($resolved.PSIsContainer) {
      $files += Get-ChildItem -LiteralPath $resolved.FullName -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.Extension -in @(".md",".txt") -and -not (Test-AEIgnoredRequirementPath $ProjectRoot $_.FullName) }
    } elseif ($resolved.Extension -in @(".md",".txt") -and -not (Test-AEIgnoredRequirementPath $ProjectRoot $resolved.FullName)) {
      $files += $resolved
    }
  }
  return @($files | Sort-Object FullName -Unique)
}

function Get-AEIgnoredRequirementReferences($ProjectRoot) {
  $docsDir = Join-Path $ProjectRoot "docs"
  if (!(Test-Path -LiteralPath $docsDir)) { return @() }
  $ignored = Get-ChildItem -LiteralPath $docsDir -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".md",".txt") -and (Test-AEIgnoredRequirementPath $ProjectRoot $_.FullName) } |
    ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.FullName }
  return @($ignored | Sort-Object -Unique)
}

function Get-HarnessLaneEnabled($ProjectRoot, $Lane, $Default = $true) {
  $p = Get-AEPaths $ProjectRoot
  if (!(Test-Path -LiteralPath $p.HarnessConfig)) { return $Default }
  $lines = Get-Content -LiteralPath $p.HarnessConfig
  $inLanes = $false
  $inLane = $false
  foreach ($line in $lines) {
    if ($line -match "^\s*lanes\s*:\s*$") { $inLanes = $true; continue }
    if ($inLanes -and $line -match "^\S") { $inLanes = $false; $inLane = $false }
    if ($inLanes -and $line -match "^\s{2}$Lane\s*:\s*$") { $inLane = $true; continue }
    if ($inLane -and $line -match "^\s{2}\S") { $inLane = $false }
    if ($inLane -and $line -match "^\s{4}enabled\s*:\s*(true|false)\s*$") { return ($Matches[1] -eq "true") }
  }
  return $Default
}

function Add-VerificationResult($ProjectRoot, $Gate, $Status, $Details, $Evidence = "") {
  $p = Get-AEPaths $ProjectRoot
  Ensure-Dir (Split-Path $p.Verification)
  $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $entry = "`n## $Gate`n- Time: $time`n- Status: $Status`n- Details: $Details`n- Evidence: $Evidence`n"
  $written = $false
  for ($attempt = 1; $attempt -le 20 -and -not $written; $attempt++) {
    try {
      $encoding = New-Object System.Text.UTF8Encoding($false)
      $bytes = $encoding.GetBytes($entry)
      $stream = [System.IO.File]::Open($p.Verification, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
      try {
        [void]$stream.Seek(0, [System.IO.SeekOrigin]::End)
        $stream.Write($bytes, 0, $bytes.Length)
      } finally {
        $stream.Dispose()
      }
      $written = $true
    } catch {
      if ($attempt -eq 20) {
        Write-Warning "Unable to append verification result for $Gate to $($p.Verification): $($_.Exception.Message)"
        break
      }
      Start-Sleep -Milliseconds (150 * $attempt)
    }
  }
  if (![string]::IsNullOrWhiteSpace($Evidence)) { Add-EvidenceItem $ProjectRoot "log" $Evidence $Gate }
}

function Add-Blocker($ProjectRoot, $Gate, $Type, $Details) {
  $p = Get-AEPaths $ProjectRoot
  Ensure-Dir (Split-Path $p.Blockers)
  $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Encoding UTF8 $p.Blockers "`n## $Gate`n- Time: $time`n- Type: $Type`n- Details: $Details`n"
}

function Update-RepairAttempt($ProjectRoot, $Gate, $Status, $LastError = "") {
  Initialize-MachineFiles $ProjectRoot
  $p = Get-AEPaths $ProjectRoot
  try { $obj = Get-Content -LiteralPath $p.RepairAttempts -Raw | ConvertFrom-Json } catch { $obj = [PSCustomObject]@{} }
  $current = $obj.$Gate
  $attempts = 0
  if ($null -ne $current -and $null -ne $current.attempts) { $attempts = [int]$current.attempts }
  $entry = [PSCustomObject]@{
    attempts = $attempts + 1
    lastError = $LastError
    status = $Status
    updatedAt = (Get-Date).ToString("s")
  }
  $obj | Add-Member -NotePropertyName $Gate -NotePropertyValue $entry -Force
  $obj | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.RepairAttempts
}

function Add-RepairLog($ProjectRoot, $Gate, $Details) {
  $p = Get-AEPaths $ProjectRoot
  $file = Join-Path $p.Docs "08-repair-log.md"
  Add-Content -Encoding UTF8 $file "`n## $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Gate`n$Details`n"
}

function Update-State($ProjectRoot, $Phase, $Status, $NextAction = "") {
  $p = Get-AEPaths $ProjectRoot
  $obj = @{
    projectRoot = $p.ProjectRoot
    lastRunAt = (Get-Date).ToString("s")
    phase = $Phase
    status = $Status
    nextAction = $NextAction
  }
  $obj | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.State
}

function Write-Section($Text) {
  Write-Host ""
  Write-Host "==== $Text ===="
}

function Test-CommandExists($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Gate($ProjectRoot, $Gate, [scriptblock]$Command, $LogName) {
  $p = Get-AEPaths $ProjectRoot
  Ensure-Dir $p.Logs
  if ([string]::IsNullOrWhiteSpace($LogName)) { $LogName = ($Gate -replace "[^a-zA-Z0-9_-]", "_") + ".log" }
  $log = Join-Path $p.Logs $LogName
  Write-Section $Gate
  try {
    $global:LASTEXITCODE = 0
    $output = & $Command *>&1
    $code = $LASTEXITCODE
    $output | Tee-Object -FilePath $log | Out-Host
    if ($null -eq $code) { $code = 0 }
    if ($code -eq 0) {
      Write-Host "[PASS] $Gate"
      Add-VerificationResult $ProjectRoot $Gate "PASS" "Exit code 0" $log
      Add-EvidenceItem $ProjectRoot "log" $log $Gate
      return $true
    } else {
      Write-Host "ERROR: $Gate failed because exit code $code"
      Add-VerificationResult $ProjectRoot $Gate "HARD_FAIL" "Exit code $code" $log
      Update-RepairAttempt $ProjectRoot $Gate "RETRYING" "Exit code $code"
      return $false
    }
  } catch {
    Write-Host "ERROR: $Gate failed because $($_.Exception.Message)"
    Add-VerificationResult $ProjectRoot $Gate "HARD_FAIL" $_.Exception.Message $log
    Update-RepairAttempt $ProjectRoot $Gate "RETRYING" $_.Exception.Message
    return $false
  }
}

function Read-PackageScripts($PackageJson) {
  if (!(Test-Path $PackageJson)) { return @{} }
  try {
    $pkg = Get-Content $PackageJson -Raw | ConvertFrom-Json
    if ($null -eq $pkg.scripts) { return @{} }
    $dict = @{}
    $pkg.scripts.PSObject.Properties | ForEach-Object { $dict[$_.Name] = $_.Value }
    return $dict
  } catch { return @{} }
}

function Test-UnsafeDatabaseUrl($Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
  $lower = $Url.ToLowerInvariant()
  return ($lower.Contains("supabase.co") -or $lower.Contains("production") -or $lower.Contains("prod"))
}
