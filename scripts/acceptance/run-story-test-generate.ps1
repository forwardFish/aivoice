param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-test-generate" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-test-generate"
  exit 0
}

function New-TestPointObject($StoryId, [int]$Index, [string]$Type, [string]$Target, [string]$Expected) {
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

function Get-TestPointEvidence($TestPoint) {
  $items = @()
  foreach ($name in @("evidence","evidencePaths","logs","screenshots","results")) {
    foreach ($item in @($TestPoint.$name)) {
      if (![string]::IsNullOrWhiteSpace([string]$item)) { $items += $item }
    }
  }
  return @($items)
}

try { $target = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $target = $null }
$stories = if ($null -ne $target -and $null -ne $target.stories) { @($target.stories) } else { @() }
$matrix = @()
$updatedStories = @()

foreach ($story in $stories) {
  $storyId = if (![string]::IsNullOrWhiteSpace([string]$story.storyId)) { [string]$story.storyId } else { [string]$story.id }
  if ([string]::IsNullOrWhiteSpace($storyId)) { $storyId = "STORY-UNKNOWN-$($updatedStories.Count + 1)" }
  $testPoints = @($story.testPoints) | Where-Object { $null -ne $_ }
  $tpIndex = $testPoints.Count + 1
  if ($testPoints.Count -eq 0) {
    foreach ($surface in @($story.surfaces)) {
      if (![string]::IsNullOrWhiteSpace([string]$surface)) {
        $testPoints += New-TestPointObject $storyId $tpIndex "route" ([string]$surface) "route is reachable and renders the story surface"
        $tpIndex++
      }
    }
    foreach ($api in @($story.apis)) {
      if (![string]::IsNullOrWhiteSpace([string]$api)) {
        $testPoints += New-TestPointObject $storyId $tpIndex "api" ([string]$api) "API contract supports the story"
        $tpIndex++
      }
    }
    foreach ($criterion in @($story.acceptanceCriteria)) {
      if (![string]::IsNullOrWhiteSpace([string]$criterion)) {
        $testPoints += New-TestPointObject $storyId $tpIndex "functional" ([string]$criterion) "acceptance criterion is proven by executable evidence"
        $tpIndex++
      }
    }
  }
  foreach ($testPoint in $testPoints) {
    $type = if (![string]::IsNullOrWhiteSpace([string]$testPoint.type)) { [string]$testPoint.type } else { "functional" }
    $targetText = [string]$testPoint.target
    if ($targetText -match "(?i)^/?api/|^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/api/") { $type = "api" }
    elseif ($targetText -match "(?i)\.(png|jpg|jpeg|webp|gif)$|visual|screenshot") { $type = "visual" }
    elseif ($targetText -match "^/") { $type = "route" }
    $id = if (![string]::IsNullOrWhiteSpace([string]$testPoint.id)) { [string]$testPoint.id } else { "TP-$storyId-$('{0:D3}' -f $tpIndex)" }
    $evidence = @(Get-TestPointEvidence $testPoint)
    $normalized = [PSCustomObject]@{
      id = $id
      storyId = $storyId
      type = $type
      target = $targetText
      expected = $(if (![string]::IsNullOrWhiteSpace([string]$testPoint.expected)) { [string]$testPoint.expected } else { "story test point passes with evidence" })
      evidence = $evidence
      status = $(if (![string]::IsNullOrWhiteSpace([string]$testPoint.status)) { [string]$testPoint.status } else { "PENDING" })
    }
    $matrix += $normalized
  }
  $story | Add-Member -NotePropertyName testPoints -NotePropertyValue @($matrix | Where-Object { $_.storyId -eq $storyId }) -Force
  $updatedStories += $story
}

@{
  schemaVersion = $AE_SCHEMA_VERSION
  stories = $updatedStories
  generatedAt = (Get-Date).ToString("s")
  status = $(if ($updatedStories.Count -gt 0) { "PENDING" } else { "EMPTY" })
  note = "P0/P1 stories are accepted only when every required test point has evidence."
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.StoryTarget

@{
  schemaVersion = $AE_SCHEMA_VERSION
  testPoints = $matrix
  generatedAt = (Get-Date).ToString("s")
  status = $(if ($matrix.Count -gt 0) { "PENDING" } else { "EMPTY" })
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.StoryTestMatrix

$matrixMd = Join-Path $p.Docs "04-story-test-matrix.md"
@(
  "# Story Test Matrix",
  "",
  "Generated: $(Get-Date)",
  "",
  "| Test point ID | Story ID | Type | Target | Expected | Evidence | Status |",
  "|---|---|---|---|---|---|---|",
  $(if ($matrix.Count -gt 0) {
    $matrix | ForEach-Object { "| $($_.id) | $($_.storyId) | $($_.type) | $($_.target -replace '\|','/') | $($_.expected -replace '\|','/') | $(@($_.evidence) -join ', ') | $($_.status) |" }
  } else { "| - | - | - | No story test points generated | - | - | EMPTY |" })
) | Set-Content -Encoding UTF8 $matrixMd

$statusOut = if ($matrix.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" }
Write-LaneResult $ProjectRoot "story-test-generate" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $p.StoryTestMatrix),(Get-RelativeEvidencePath $ProjectRoot $matrixMd),(Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget)) $(if ($matrix.Count -eq 0) { @("No story test points generated.") } else { @("Story test points are generated but still require executable evidence.") }) @("Attach route/API/E2E/visual evidence to story test points, then run run-story-verify.ps1.")
Add-VerificationResult $ProjectRoot "story-test-generate" $statusOut "Generated $($matrix.Count) story test point(s)" $p.StoryTestMatrix
Write-Host "[$statusOut] story-test-generate: $($matrix.Count) test point(s)"
