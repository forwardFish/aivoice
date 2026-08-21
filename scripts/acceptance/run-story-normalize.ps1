param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-normalize" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-normalize"
  exit 0
}

function Get-StoryArrayValue($Obj, [string[]]$Names) {
  $items = @()
  foreach ($name in $Names) {
    $value = $Obj.$name
    if ($null -eq $value) { continue }
    foreach ($item in @($value)) {
      if (![string]::IsNullOrWhiteSpace([string]$item)) { $items += [string]$item }
    }
  }
  return @($items | Sort-Object -Unique)
}

function Get-StoryScalarValue($Obj, [string[]]$Names, [string]$Default = "") {
  foreach ($name in $Names) {
    if (![string]::IsNullOrWhiteSpace([string]$Obj.$name)) { return [string]$Obj.$name }
  }
  return $Default
}

function Get-TestPointType([string]$Target, [string]$Fallback = "functional") {
  if ($Target -match "(?i)^/?api/|^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/api/") { return "api" }
  if ($Target -match "(?i)\.(png|jpg|jpeg|webp|gif)$|docs/.+ui|visual|screenshot") { return "visual" }
  if ($Target -match "^/") { return "route" }
  return $Fallback
}

function New-TestPoint($StoryId, [int]$Index, [string]$Type, [string]$Target, [string]$Expected) {
  [PSCustomObject]@{
    id = "TP-$StoryId-$('{0:D3}' -f $Index)"
    storyId = $StoryId
    type = $Type
    target = $Target
    expected = $Expected
    evidence = @()
    status = "PENDING"
  }
}

function New-NormalizedStory($InputStory, [int]$Index) {
  $storyId = Get-StoryScalarValue $InputStory @("storyId","id") "STORY-$('{0:D3}' -f $Index)"
  $priority = Get-StoryScalarValue $InputStory @("priority") "P1"
  $surfaces = Get-StoryArrayValue $InputStory @("surfaces","surface","routes","route","screens","ui")
  $apis = Get-StoryArrayValue $InputStory @("apis","api","endpoints","endpoint")
  $criteria = Get-StoryArrayValue $InputStory @("acceptanceCriteria","acceptance","criteria")
  $title = Get-StoryScalarValue $InputStory @("title","description","goal") $storyId
  $goal = Get-StoryScalarValue $InputStory @("goal","description","title") $title
  if ($criteria.Count -eq 0 -and ![string]::IsNullOrWhiteSpace($goal)) { $criteria = @($goal) }
  $testPoints = @()
  $tpIndex = 1
  foreach ($surface in $surfaces) {
    $testPoints += New-TestPoint $storyId $tpIndex "route" $surface "route is reachable and supports the story goal"
    $tpIndex++
  }
  foreach ($api in $apis) {
    $type = Get-TestPointType $api "api"
    $testPoints += New-TestPoint $storyId $tpIndex $type $api "API contract supports the story goal"
    $tpIndex++
  }
  foreach ($criterion in $criteria) {
    if ([string]::IsNullOrWhiteSpace($criterion)) { continue }
    $testPoints += New-TestPoint $storyId $tpIndex "functional" $criterion "acceptance criterion is proven by test/log/screenshot/API evidence"
    $tpIndex++
  }
  $existingTestPoints = @($InputStory.testPoints) | Where-Object { $null -ne $_ }
  if ($existingTestPoints.Count -gt 0) { $testPoints = $existingTestPoints }
  $evidenceRequired = Get-StoryArrayValue $InputStory @("evidenceRequired","verification","verificationRequired")
  if ($evidenceRequired.Count -eq 0) {
    $evidenceRequired = @("story verifier")
    if ($surfaces.Count -gt 0) { $evidenceRequired += "route smoke"; $evidenceRequired += "screenshot" }
    if ($apis.Count -gt 0) { $evidenceRequired += "API smoke"; $evidenceRequired += "contract verifier" }
    if ($priority -in @("P0","P1")) { $evidenceRequired += "E2E flow" }
    $evidenceRequired = @($evidenceRequired | Sort-Object -Unique)
  }
  [PSCustomObject]@{
    storyId = $storyId
    epicId = Get-StoryScalarValue $InputStory @("epicId","epic") "EPIC-CORE"
    sprintId = Get-StoryScalarValue $InputStory @("sprintId","sprint") $(if ($priority -in @("P0","P1")) { "SPRINT-P0" } else { "SPRINT-LATER" })
    priority = $priority
    title = $title
    sourceRequirements = @(Get-StoryArrayValue $InputStory @("sourceRequirements","requirements","requirementIds"))
    actor = Get-StoryScalarValue $InputStory @("actor") "user"
    goal = $goal
    surfaces = @($surfaces)
    apis = @($apis)
    dataModels = @(Get-StoryArrayValue $InputStory @("dataModels","models","entities"))
    acceptanceCriteria = @($criteria)
    testPoints = @($testPoints)
    evidenceRequired = @($evidenceRequired)
    evidence = @(Get-StoryArrayValue $InputStory @("evidence","evidencePaths"))
    source = Get-StoryScalarValue $InputStory @("source") (Get-RelativeEvidencePath $ProjectRoot $p.StoryCandidates)
    normalized = $true
    status = $(if (![string]::IsNullOrWhiteSpace([string]$InputStory.status) -and [string]$InputStory.status -ne "CANDIDATE") { [string]$InputStory.status } else { "PENDING" })
  }
}

try { $target = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $candidates = Get-Content -LiteralPath $p.StoryCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
try { $curated = Get-Content -LiteralPath $p.StoryCandidatesCurated -Raw | ConvertFrom-Json } catch { $curated = $null }
try { $requirements = Get-Content -LiteralPath $p.RequirementTarget -Raw | ConvertFrom-Json } catch { $requirements = $null }

$sourceStories = @()
$targetStories = if ($null -ne $target -and $null -ne $target.stories) { @($target.stories) } else { @() }
if ($null -ne $curated -and $null -ne $curated.items -and @($curated.items | Where-Object { $_.classification -eq "VALID_STORY" }).Count -gt 0) {
  foreach ($item in @($curated.items | Where-Object { $_.classification -eq "VALID_STORY" })) {
    $raw = if (![string]::IsNullOrWhiteSpace([string]$item.rawText)) { [string]$item.rawText } else { [string]$item.candidate.description }
    $candidate = $item.candidate
    $sourceStories += [PSCustomObject]@{
      storyId = $(if (![string]::IsNullOrWhiteSpace([string]$item.suggestedStoryId)) { [string]$item.suggestedStoryId } else { [string]$item.candidateId })
      title = $raw
      description = $raw
      goal = $raw
      priority = $(if (![string]::IsNullOrWhiteSpace([string]$item.priority)) { [string]$item.priority } else { "P1" })
      sourceRequirements = @($candidate.sourceRequirements)
      surfaces = @($candidate.surfaces)
      apis = @($candidate.apis)
      acceptanceCriteria = @($candidate.acceptanceCriteria)
      source = Get-RelativeEvidencePath $ProjectRoot $p.StoryCandidatesCurated
      status = "PENDING"
    }
  }
} elseif ($null -ne $candidates -and $null -ne $candidates.candidates -and @($candidates.candidates).Count -gt 0) {
  $sourceStories = @($candidates.candidates)
} elseif ($null -ne $requirements -and $null -ne $requirements.requirements) {
  foreach ($req in @($requirements.requirements)) {
    $sourceStories += [PSCustomObject]@{
      storyId = "STORY-FROM-$($req.id)"
      title = $req.description
      goal = $req.description
      priority = $req.priority
      sourceRequirements = @($req.id)
      surfaces = @($req.surfaces) + @($req.routes) + @($req.screens)
      apis = @($req.apis) + @($req.endpoints)
      acceptanceCriteria = @($req.acceptance) + @($req.acceptanceCriteria)
      source = Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget
      status = "PENDING"
    }
  }
} elseif ($targetStories.Count -gt 0) {
  $sourceStories = @($target.stories)
}

$stories = @()
$idx = 1
foreach ($story in $sourceStories) {
  $stories += New-NormalizedStory $story $idx
  $idx++
}

$epics = @($stories | Group-Object epicId | ForEach-Object {
  [PSCustomObject]@{ epicId=$_.Name; stories=@($_.Group | ForEach-Object { $_.storyId }); priority=$(if (@($_.Group | Where-Object { $_.priority -eq "P0" }).Count -gt 0) { "P0" } elseif (@($_.Group | Where-Object { $_.priority -eq "P1" }).Count -gt 0) { "P1" } else { "P2" }) }
})
$sprints = @($stories | Group-Object sprintId | ForEach-Object {
  [PSCustomObject]@{ sprintId=$_.Name; stories=@($_.Group | ForEach-Object { $_.storyId }); priority=$(if ($_.Name -eq "SPRINT-P0") { "P0" } else { "P2" }) }
})

@{ schemaVersion=$AE_SCHEMA_VERSION; epics=$epics; generatedAt=(Get-Date).ToString("s"); status=$(if ($epics.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "EMPTY" }) } | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $p.EpicMap
@{ schemaVersion=$AE_SCHEMA_VERSION; sprints=$sprints; generatedAt=(Get-Date).ToString("s"); status=$(if ($sprints.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "EMPTY" }) } | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $p.SprintPlan
@{ schemaVersion=$AE_SCHEMA_VERSION; stories=$stories; generatedAt=(Get-Date).ToString("s"); status=$(if ($stories.Count -gt 0) { "PENDING" } else { "EMPTY" }); note="Stories are normalized acceptance units. P0/P1 stories require test point evidence before PASS." } | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.StoryTarget

$storyMap = Join-Path $p.Docs "03-story-map.md"
@(
  "# Story Map",
  "",
  "Generated: $(Get-Date)",
  "",
  "| Story ID | Epic | Sprint | Priority | Actor | Goal | Source requirements | Surfaces | APIs | Status | Evidence |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  $(if ($stories.Count -gt 0) {
    $stories | ForEach-Object { "| $($_.storyId) | $($_.epicId) | $($_.sprintId) | $($_.priority) | $($_.actor) | $($_.goal -replace '\|','/') | $(@($_.sourceRequirements) -join ', ') | $(@($_.surfaces) -join ', ') | $(@($_.apis) -join ', ') | $($_.status) | $(@($_.evidence) -join ', ') |" }
  } else { "| - | - | - | - | - | No stories normalized | - | - | - | EMPTY | - |" })
) | Set-Content -Encoding UTF8 $storyMap

$statusOut = if ($stories.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" }
Write-LaneResult $ProjectRoot "story-normalize" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget),(Get-RelativeEvidencePath $ProjectRoot $p.EpicMap),(Get-RelativeEvidencePath $ProjectRoot $p.SprintPlan),(Get-RelativeEvidencePath $ProjectRoot $storyMap)) $(if ($stories.Count -eq 0) { @("No stories could be normalized.") } else { @("Stories are normalized but not accepted until test points have evidence.") }) @("Run run-story-test-generate.ps1 and run-story-verify.ps1.")
Add-VerificationResult $ProjectRoot "story-normalize" $statusOut "Normalized $($stories.Count) story item(s)" $p.StoryTarget
Write-Host "[$statusOut] story-normalize: $($stories.Count) story item(s)"
