param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

try { $target = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $statusDoc = Get-Content -LiteralPath $p.StoryStatus -Raw | ConvertFrom-Json } catch { $statusDoc = $null }
try { $materialized = Get-Content -LiteralPath $p.StoryMaterializedTests -Raw | ConvertFrom-Json } catch { $materialized = $null }
try { $quality = Get-Content -LiteralPath $p.StoryQualityGate -Raw | ConvertFrom-Json } catch { $quality = $null }

function Get-ReportValues($Obj, [string[]]$Names) {
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

function Get-PointEvidence($Point) {
  $items = Get-ReportValues $Point @("evidence","evidencePaths","logs","screenshots","results")
  if (![string]::IsNullOrWhiteSpace([string]$Point.evidenceOutput)) { $items += [string]$Point.evidenceOutput }
  return @($items | Where-Object { ![string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
}

$stories = if ($null -ne $target -and $null -ne $target.stories) { @($target.stories) } else { @() }
$statusItems = if ($null -ne $statusDoc -and $null -ne $statusDoc.stories) { @($statusDoc.stories) } else { @() }
$qualityFailures = if ($null -ne $quality -and $null -ne $quality.failedStories) { @($quality.failedStories) } else { @() }
$rows = @()

foreach ($story in $stories) {
  $storyId = if (![string]::IsNullOrWhiteSpace([string]$story.storyId)) { [string]$story.storyId } elseif (![string]::IsNullOrWhiteSpace([string]$story.id)) { [string]$story.id } else { "STORY-UNKNOWN" }
  $priority = if (![string]::IsNullOrWhiteSpace([string]$story.priority)) { [string]$story.priority } else { "P1" }
  $testPoints = @($story.testPoints) | Where-Object { $null -ne $_ }
  $mStory = $null
  if ($null -ne $materialized -and $null -ne $materialized.stories) {
    $mStory = @($materialized.stories | Where-Object { $_.storyId -eq $storyId } | Select-Object -First 1)
  }
  $materializedPoints = if ($null -ne $mStory) { @($mStory.testPoints) } else { @() }
  $statusItem = @($statusItems | Where-Object { $_.storyId -eq $storyId } | Select-Object -First 1)
  $openGaps = @()
  if ($null -ne $statusItem) { $openGaps += @($statusItem.openGaps) }
  $openGaps += @($qualityFailures | Where-Object { $_.storyId -eq $storyId } | ForEach-Object { $_.issue })
  $openGaps = @($openGaps | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) })
  $evidence = @()
  $evidence += Get-ReportValues $story @("evidence","evidencePaths")
  foreach ($tp in $testPoints) { $evidence += Get-PointEvidence $tp }
  foreach ($tp in $materializedPoints) { $evidence += Get-PointEvidence $tp }
  $evidence = @($evidence | Where-Object { ![string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
  $passedPoints = @($testPoints | Where-Object { $_.status -in @("PASS","PASS_WITH_LIMITATION") }).Count
  $totalPoints = $testPoints.Count
  $storyStatus = [string]$story.status
  if ($openGaps.Count -gt 0) { $storyStatus = "HARD_FAIL" }
  elseif ([string]::IsNullOrWhiteSpace($storyStatus) -or $storyStatus -eq "PENDING") {
    if ($priority -in @("P0","P1")) {
      $storyStatus = if ($totalPoints -gt 0 -and $passedPoints -eq $totalPoints -and $evidence.Count -gt 0) { "PASS" } else { "HARD_FAIL" }
    } else {
      $storyStatus = if ($totalPoints -gt 0 -and $passedPoints -eq $totalPoints -and $evidence.Count -gt 0) { "PASS" } else { "DEFERRED" }
    }
  }
  $rows += [PSCustomObject]@{
    storyId = $storyId
    priority = $priority
    title = [string]$story.title
    status = $storyStatus
    testPointsPassed = $passedPoints
    testPointsTotal = $totalPoints
    evidence = $evidence
    gaps = @($openGaps | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) })
    materializedTestPoints = $materializedPoints
  }
}

$p0 = @($rows | Where-Object { $_.priority -eq "P0" })
$p1 = @($rows | Where-Object { $_.priority -eq "P1" })
$p0p1 = @($rows | Where-Object { $_.priority -in @("P0","P1") })
$passP0P1 = @($p0p1 | Where-Object { $_.status -eq "PASS" }).Count
$passRate = if ($p0p1.Count -gt 0) { [math]::Round(($passP0P1 / $p0p1.Count) * 100, 2) } else { 0 }
$counts = @{
  totalStories = $rows.Count
  p0Stories = $p0.Count
  p1Stories = $p1.Count
  passStories = @($rows | Where-Object { $_.status -eq "PASS" }).Count
  passWithLimitationStories = @($rows | Where-Object { $_.status -eq "PASS_WITH_LIMITATION" }).Count
  hardFailStories = @($rows | Where-Object { $_.status -eq "HARD_FAIL" }).Count
  manualReviewRequiredStories = @($rows | Where-Object { $_.status -eq "MANUAL_REVIEW_REQUIRED" }).Count
  deferredStories = @($rows | Where-Object { $_.status -eq "DEFERRED" }).Count
  p0p1PassRate = $passRate
}
$statusOut = if ($counts.hardFailStories -gt 0) { "HARD_FAIL" } elseif (($counts.passWithLimitationStories + $counts.manualReviewRequiredStories + $counts.deferredStories) -gt 0) { "PASS_WITH_LIMITATION" } elseif ($rows.Count -gt 0) { "PASS" } else { "MANUAL_REVIEW_REQUIRED" }

@{
  schemaVersion = $AE_SCHEMA_VERSION
  generatedAt = (Get-Date).ToString("s")
  status = $statusOut
  summary = $counts
  stories = $rows
  sources = @{
    storyTarget = Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget
    storyStatus = Get-RelativeEvidencePath $ProjectRoot $p.StoryStatus
    storyMaterializedTests = Get-RelativeEvidencePath $ProjectRoot $p.StoryMaterializedTests
    storyQualityGate = Get-RelativeEvidencePath $ProjectRoot $p.StoryQualityGate
  }
} | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $p.StoryAcceptanceSummary

$section = @(
  "## Story Acceptance Summary",
  "",
  "- Story total: $($counts.totalStories)",
  "- P0 stories: $($counts.p0Stories)",
  "- P1 stories: $($counts.p1Stories)",
  "- PASS stories: $($counts.passStories)",
  "- PASS_WITH_LIMITATION stories: $($counts.passWithLimitationStories)",
  "- HARD_FAIL stories: $($counts.hardFailStories)",
  "- MANUAL_REVIEW_REQUIRED stories: $($counts.manualReviewRequiredStories)",
  "- DEFERRED stories: $($counts.deferredStories)",
  "- P0/P1 story pass rate: $($counts.p0p1PassRate)%",
  "",
  "Status meaning: PASS means automated story evidence passed; PASS_NEEDS_MANUAL_UI_REVIEW means story flow is functionally accepted but visual review remains; PASS_WITH_LIMITATION means documented limitations remain; HARD_FAIL means a required story gate or evidence path is missing.",
  "",
  "| Story ID | Priority | Title | Status | Test Points | Evidence | Gaps |",
  "|---|---|---|---|---:|---|---|"
)
if ($rows.Count -gt 0) {
  foreach ($row in $rows) {
    $ev = if (@($row.evidence).Count -gt 0) { (@($row.evidence) -join "<br>") } else { "None" }
    $gap = if (@($row.gaps).Count -gt 0) { (@($row.gaps) -join "<br>") } else { "None" }
    $title = ([string]$row.title) -replace '\|','/'
    $section += "| $($row.storyId) | $($row.priority) | $title | $($row.status) | $($row.testPointsPassed)/$($row.testPointsTotal) | $ev | $gap |"
  }
} else {
  $section += "| - | - | No stories normalized | MANUAL_REVIEW_REQUIRED | 0/0 | None | story-target empty |"
}
$sectionText = ($section -join "`r`n") + "`r`n"

Ensure-Dir (Split-Path $p.FinalReport)
if (!(Test-Path -LiteralPath $p.FinalReport)) {
  "# AUTO EXECUTE DELIVERY REPORT`r`n`r`nGenerated: $(Get-Date)`r`n`r`n" | Set-Content -Encoding UTF8 $p.FinalReport
}
$reportText = Get-Content -LiteralPath $p.FinalReport -Raw
$pattern = "(?ms)^## Story Acceptance Summary\s+.*?(?=^## |\z)"
if ($reportText -match $pattern) {
  $reportText = [regex]::Replace($reportText, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $sectionText })
} else {
  $reportText = $reportText.TrimEnd() + "`r`n`r`n" + $sectionText
}
$reportText | Set-Content -Encoding UTF8 $p.FinalReport

Write-LaneResult $ProjectRoot "story-final-report" $statusOut @() @(
  (Get-RelativeEvidencePath $ProjectRoot $p.StoryAcceptanceSummary),
  (Get-RelativeEvidencePath $ProjectRoot $p.FinalReport)
) @() @("Use Story Acceptance Summary as the story-level delivery index.")
Add-VerificationResult $ProjectRoot "story-final-report" $statusOut "Story acceptance summary generated with $($rows.Count) story row(s)" $p.StoryAcceptanceSummary
Write-Host "[$statusOut] story-final-report: $($rows.Count) story row(s), P0/P1 pass rate $passRate%"
