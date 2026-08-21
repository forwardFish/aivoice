param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-quality-gate" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-quality-gate"
  exit 0
}

try { $target = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $candidates = Get-Content -LiteralPath $p.StoryCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
try { $curated = Get-Content -LiteralPath $p.StoryCandidatesCurated -Raw | ConvertFrom-Json } catch { $curated = $null }
try { $materialized = Get-Content -LiteralPath $p.StoryMaterializedTests -Raw | ConvertFrom-Json } catch { $materialized = $null }

$failedStories = @()
$warnings = @()
$requiredFields = @("storyId","epicId","sprintId","priority","title","actor","goal","sourceRequirements","acceptanceCriteria","testPoints","evidenceRequired","status")

function Get-QualityValues($Obj, [string[]]$Names) {
  $values = @()
  foreach ($name in $Names) {
    $value = $Obj.$name
    if ($null -eq $value) { continue }
    foreach ($item in @($value)) {
      if (![string]::IsNullOrWhiteSpace([string]$item)) { $values += [string]$item }
    }
  }
  return @($values)
}

function Add-StoryQualityIssue($StoryId, $Issue, $RequiredFix, $Severity, $Source) {
  $script:failedStories += [PSCustomObject]@{
    storyId = $StoryId
    issue = $Issue
    requiredFix = $RequiredFix
    severity = $Severity
    source = $Source
  }
  if ($Severity -in @("HARD_FAIL","IN_SCOPE_GAP")) {
    Add-Gap $ProjectRoot $round "GAP-$StoryId-STORY-QUALITY-$($script:failedStories.Count)" "story-quality" $Severity $Issue $RequiredFix $Source
  }
}

function Test-StoryLooksCopied($Story, [object[]]$CandidateItems) {
  $title = ([string]$Story.title).Trim()
  if ([string]::IsNullOrWhiteSpace($title)) { return $false }
  foreach ($candidate in @($CandidateItems)) {
    $candidateText = ""
    foreach ($name in @("rawText","description","title","goal")) {
      if (![string]::IsNullOrWhiteSpace([string]$candidate.$name)) { $candidateText = ([string]$candidate.$name).Trim(); break }
    }
    if (![string]::IsNullOrWhiteSpace($candidateText) -and $title -eq $candidateText) {
      return $true
    }
  }
  return $false
}

$stories = if ($null -ne $target -and $null -ne $target.stories) { @($target.stories) } else { @() }
$candidateItems = @()
if ($null -ne $candidates -and $null -ne $candidates.candidates) { $candidateItems += @($candidates.candidates) }
if ($null -ne $curated -and $null -ne $curated.items) { $candidateItems += @($curated.items) }

if ($stories.Count -eq 0) {
  Add-StoryQualityIssue "STORY-TARGET" "story-target.json has no normalized stories." "Run story extraction, curation, and normalization before final gate." "HARD_FAIL" (Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget)
}

foreach ($story in $stories) {
  $storyId = if (![string]::IsNullOrWhiteSpace([string]$story.storyId)) { [string]$story.storyId } elseif (![string]::IsNullOrWhiteSpace([string]$story.id)) { [string]$story.id } else { "STORY-UNKNOWN" }
  $priority = if (![string]::IsNullOrWhiteSpace([string]$story.priority)) { [string]$story.priority } else { "P1" }
  $status = [string]$story.status
  $source = if (![string]::IsNullOrWhiteSpace([string]$story.source)) { [string]$story.source } else { Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget }
  $inScope = $status -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED")
  if ($priority -notin @("P0","P1") -or -not $inScope) { continue }

  foreach ($field in $requiredFields) {
    $value = $story.$field
    $missing = $false
    if ($null -eq $value) { $missing = $true }
    else {
      $items = @($value)
      if ($items.Count -eq 0) { $missing = $true }
      elseif ($items.Count -eq 1 -and ($items[0] -is [string]) -and [string]::IsNullOrWhiteSpace([string]$items[0])) { $missing = $true }
    }
    if ($missing) {
      Add-StoryQualityIssue $storyId "P0/P1 story $storyId is missing required field $field." "Populate $field in story-target.json." "HARD_FAIL" $source
    }
  }

  $surfaces = Get-QualityValues $story @("surfaces","routes","screens")
  $apis = Get-QualityValues $story @("apis","endpoints")
  if (($surfaces.Count + $apis.Count) -eq 0) {
    Add-StoryQualityIssue $storyId "P0/P1 story $storyId has neither surfaces nor apis." "Map the story to at least one UI surface/route or API endpoint." "HARD_FAIL" $source
  }

  $acceptance = Get-QualityValues $story @("acceptanceCriteria","acceptance","criteria")
  if ($acceptance.Count -eq 0) {
    Add-StoryQualityIssue $storyId "P0/P1 story $storyId acceptanceCriteria is empty." "Add concrete acceptance criteria." "HARD_FAIL" $source
  }

  $testPoints = @($story.testPoints) | Where-Object { $null -ne $_ }
  if ($testPoints.Count -eq 0) {
    Add-StoryQualityIssue $storyId "P0/P1 story $storyId testPoints is empty." "Generate route/API/E2E/visual test points." "HARD_FAIL" $source
  }

  $evidenceRequired = Get-QualityValues $story @("evidenceRequired","verification","verificationRequired")
  if ($evidenceRequired.Count -eq 0) {
    Add-StoryQualityIssue $storyId "P0/P1 story $storyId evidenceRequired is empty." "Declare the evidence classes needed to accept this story." "HARD_FAIL" $source
  }

  $types = @($testPoints | ForEach-Object { [string]$_.type } | Where-Object { ![string]::IsNullOrWhiteSpace($_) })
  if (@($types | Where-Object { $_ -in @("route","api","e2e","visual") }).Count -eq 0) {
    Add-StoryQualityIssue $storyId "P0/P1 story $storyId has no route/api/e2e/visual test point." "Add at least one executable route, api, e2e, or visual test point." "HARD_FAIL" $source
  }

  $looksCopied = Test-StoryLooksCopied $story $candidateItems
  if ($looksCopied -and ([string]::IsNullOrWhiteSpace([string]$story.actor) -or [string]::IsNullOrWhiteSpace([string]$story.goal))) {
    Add-StoryQualityIssue $storyId "Story appears to copy PRD text directly and lacks actor/goal normalization." "Normalize into title, actor, goal, acceptanceCriteria, testPoints, and evidenceRequired." "HARD_FAIL" $source
  } elseif ($looksCopied) {
    $warnings += [PSCustomObject]@{ storyId=$storyId; issue="Title matches candidate text; actor/goal are present, but human review may still improve wording." }
  }

  if ($null -ne $materialized -and $null -ne $materialized.stories) {
    $mStory = @($materialized.stories | Where-Object { $_.storyId -eq $storyId } | Select-Object -First 1)
    if ($null -eq $mStory -or @($mStory.testPoints).Count -eq 0) {
      Add-StoryQualityIssue $storyId "P0/P1 story $storyId has no materialized test records." "Run run-story-test-materialize.ps1." "HARD_FAIL" $source
    } else {
      foreach ($mt in @($mStory.testPoints)) {
        if ($mt.materializationStatus -notin @("GENERATED","BOUND","BOUND_TO_UI_VERIFIER","MANUAL_REVIEW_REQUIRED","DEFERRED")) {
          Add-StoryQualityIssue $storyId "Materialized test point $($mt.testPointId) has invalid status $($mt.materializationStatus)." "Regenerate or bind this test point." "HARD_FAIL" $source
        }
        if ($mt.materializationStatus -in @("GENERATED","BOUND","BOUND_TO_UI_VERIFIER") -and ([string]::IsNullOrWhiteSpace([string]$mt.command) -or [string]::IsNullOrWhiteSpace([string]$mt.evidenceOutput))) {
          Add-StoryQualityIssue $storyId "Materialized test point $($mt.testPointId) lacks command or evidenceOutput." "Attach executable command and evidenceOutput." "HARD_FAIL" $source
        }
      }
    }
  }
}

$statusOut = if ($failedStories.Count -gt 0) { "HARD_FAIL" } elseif ($warnings.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" }
$result = @{
  schemaVersion = $AE_SCHEMA_VERSION
  lane = "story-quality-gate"
  status = $statusOut
  generatedAt = (Get-Date).ToString("s")
  failedStories = $failedStories
  warnings = $warnings
}
$result | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.StoryQualityGate
$result | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 (Join-Path $p.Results "story-quality-gate.json")

Write-LaneResult $ProjectRoot "story-quality-gate" $statusOut @() @(
  (Get-RelativeEvidencePath $ProjectRoot $p.StoryQualityGate),
  "docs/auto-execute/results/story-quality-gate.json",
  (Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)
) $failedStories @("Fix story normalization quality issues before final PASS.")
Add-VerificationResult $ProjectRoot "story-quality-gate" $statusOut "$($failedStories.Count) failed story quality item(s), $($warnings.Count) warning(s)" $p.StoryQualityGate
Write-Host "[$statusOut] story-quality-gate: $($failedStories.Count) failure(s), $($warnings.Count) warning(s)"
