param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

function Get-RequirementDocFiles {
  return @(Get-AERequirementSourceFiles $ProjectRoot)
}

function Normalize-Title($Text) {
  return ([string]$Text).ToLowerInvariant() -replace "[^a-z0-9\u4e00-\u9fff]+"," "
}

function Test-SkippableSection($Title) {
  $t = Normalize-Title $Title
  return ($t -match "intro|introduction|background|appendix|changelog|history|glossary|目录|背景|附录|更新记录|术语")
}

try { $target = Get-Content -LiteralPath $p.RequirementTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $candidates = Get-Content -LiteralPath $p.RequirementCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
$targetText = ""
if ($null -ne $target -and $null -ne $target.requirements) {
  $targetText = (@($target.requirements) | ForEach-Object { "$($_.id) $($_.source) $($_.sourceSection) $($_.title) $($_.description) $($_.surface) $($_.api)" }) -join "`n"
}
$candidateText = ""
if ($null -ne $candidates -and $null -ne $candidates.candidates) {
  $candidateText = (@($candidates.candidates) | ForEach-Object { "$($_.id) $($_.source) $($_.description)" }) -join "`n"
}
$coverage = @()
$gaps = @()
$limitations = @()
$docs = Get-RequirementDocFiles
foreach ($file in $docs) {
  try { $lines = Get-Content -LiteralPath $file.FullName -ErrorAction Stop } catch { continue }
  $rel = Get-RelativeEvidencePath $ProjectRoot $file.FullName
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i].Trim()
    $markdownHeading = [regex]::Match($line, "^(#{1,6})\s+(.+)$")
    $numberedHeading = [regex]::Match($line, "^(\d+(\.\d+)*)(\.|\))\s+(.+)$")
    if (-not $markdownHeading.Success -and -not $numberedHeading.Success) { continue }
    $title = if ($markdownHeading.Success) { $markdownHeading.Groups[2].Value.Trim() } else { $numberedHeading.Groups[4].Value.Trim() }
    if ([string]::IsNullOrWhiteSpace($title) -or (Test-SkippableSection $title)) { continue }
    $context = ($lines[$i..([Math]::Min($i + 8, $lines.Count - 1))] -join "`n")
    $priority = if ($context -match "(?i)\bP0\b|\bP1\b|must|required|acceptance|critical|core|MVP") { "P1" } else { "P2" }
    if ($context -match "(?i)\bP0\b|critical|core") { $priority = "P0" }
    $normTitle = Normalize-Title $title
    $coveredByTarget = ($targetText -and ((Normalize-Title $targetText).Contains($normTitle) -or $targetText.Contains($rel)))
    $coveredByCandidate = ($candidateText -and ((Normalize-Title $candidateText).Contains($normTitle) -or $candidateText.Contains($rel)))
    $status = if ($coveredByTarget) { "PASS" } elseif ($coveredByCandidate) { "PASS_WITH_LIMITATION" } else { "IN_SCOPE_GAP" }
    $item = [PSCustomObject]@{
      id = "SEC-$('{0:D3}' -f ($coverage.Count + 1))"
      source = $rel
      line = $i + 1
      title = $title
      priority = $priority
      coveredByCandidate = [bool]$coveredByCandidate
      coveredByTarget = [bool]$coveredByTarget
      status = $status
    }
    $coverage += $item
    if (-not $coveredByTarget -and $priority -in @("P0","P1")) {
      $gapId = "GAP-REQ-COVERAGE-$('{0:D3}' -f $coverage.Count)"
      $description = "PRD section '$title' in $rel is not mapped into requirement-target.json."
      $repair = "Add a normalized requirement for this section to requirement-target.json, then map implementation and evidence."
      $gaps += [PSCustomObject]@{ id=$gapId; section=$item; severity="IN_SCOPE_GAP"; description=$description; repairTarget=$repair }
      Add-Gap $ProjectRoot $round $gapId "requirement-coverage" "IN_SCOPE_GAP" $description $repair $rel
    } elseif (-not $coveredByTarget) {
      $limitations += $item
    }
  }
}

$existingCandidates = @()
if ($null -ne $candidates -and $null -ne $candidates.candidates) { $existingCandidates = @($candidates.candidates) }
$candidateKeys = @{}
foreach ($candidate in $existingCandidates) {
  $candidateKeys["$($candidate.source)|$($candidate.sourceSection)|$($candidate.description)"] = $true
}
$sectionCandidates = @()
foreach ($section in $coverage) {
  $key = "$($section.source)|$($section.title)|$($section.title)"
  if (!$candidateKeys.ContainsKey($key)) {
    $sectionCandidates += [PSCustomObject]@{
      id = "COV-$('{0:D3}' -f ($sectionCandidates.Count + 1))"
      source = $section.source
      sourceSection = $section.title
      sourceLine = $section.line
      description = $section.title
      priority = $section.priority
      status = "CANDIDATE"
      normalized = $false
      evidence = @()
    }
  }
}
@{
  schemaVersion = $AE_SCHEMA_VERSION
  candidates = @($existingCandidates + $sectionCandidates)
  sourceDocuments = @($docs | ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.FullName })
  ignoredReferences = @(Get-AEIgnoredRequirementReferences $ProjectRoot)
  generatedAt = (Get-Date).ToString("s")
  status = $(if (($existingCandidates.Count + $sectionCandidates.Count) -gt 0) { "CANDIDATE" } else { "EMPTY" })
  note = "Coverage candidates are not final requirements. Normalize into requirement-target.json before final PASS."
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.RequirementCandidates

$statusOut = if ($gaps.Count -gt 0) { "HARD_FAIL" } elseif ($limitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" }
$out = Join-Path $p.Results "requirement-coverage.json"
$coverageResult = @{
  schemaVersion = $AE_SCHEMA_VERSION
  lane = "requirement-coverage"
  status = $statusOut
  generatedAt = (Get-Date).ToString("s")
  documents = @($docs | ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.FullName })
  ignoredReferences = @(Get-AEIgnoredRequirementReferences $ProjectRoot)
  sections = $coverage
  gaps = $gaps
  limitations = $limitations
  nextActions = @("Map uncovered P0/P1 PRD sections into requirement-target.json with evidence.")
}
$coverageResult | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $out

$summary = Join-Path $p.Summaries "requirement-coverage.md"
@(
  "# Requirement Coverage",
  "",
  "Generated: $(Get-Date)",
  "",
  "- Status: $statusOut",
  "- Documents: $($docs.Count)",
  "- Sections: $($coverage.Count)",
  "- P0/P1 gaps: $($gaps.Count)",
  "- Added coverage candidates: $($sectionCandidates.Count)",
  "",
  "## Gaps",
  $(if ($gaps.Count -gt 0) { $gaps | ForEach-Object { "- [$($_.severity)] $($_.section.priority) $($_.section.title) ($($_.section.source):$($_.section.line))" } } else { "- None" }),
  "",
  "## Sections",
  $(if ($coverage.Count -gt 0) { $coverage | ForEach-Object { "- $($_.id) [$($_.priority)] $($_.status): $($_.title) ($($_.source):$($_.line))" } } else { "- None" })
) | Set-Content -Encoding UTF8 $summary

Write-LaneResult $ProjectRoot "requirement-coverage" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $out),(Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget),(Get-RelativeEvidencePath $ProjectRoot $p.RequirementCandidates)) $gaps @("Repair uncovered PRD sections before final PASS.")
$coverageResult | Add-Member -NotePropertyName summary -NotePropertyValue (Get-RelativeEvidencePath $ProjectRoot $summary) -Force
$coverageResult | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $out
Add-VerificationResult $ProjectRoot "requirement-coverage" $statusOut "$($coverage.Count) PRD section(s), $($gaps.Count) P0/P1 coverage gap(s)" $out
Write-Host "[$statusOut] requirement-coverage: $($coverage.Count) section(s), $($gaps.Count) gap(s)"
