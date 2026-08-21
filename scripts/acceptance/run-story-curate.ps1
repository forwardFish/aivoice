param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-curation" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-curation"
  exit 0
}

function Get-CurationText($Candidate) {
  foreach ($name in @("rawText","description","goal","title")) {
    if (![string]::IsNullOrWhiteSpace([string]$Candidate.$name)) { return [string]$Candidate.$name }
  }
  return ""
}

function Get-CurationId($Candidate, [int]$Index) {
  foreach ($name in @("candidateId","storyId","id")) {
    if (![string]::IsNullOrWhiteSpace([string]$Candidate.$name)) { return [string]$Candidate.$name }
  }
  return "CAND-STORY-$('{0:D3}' -f $Index)"
}

function Get-CurationPriority($Candidate, [string]$Text) {
  if (![string]::IsNullOrWhiteSpace([string]$Candidate.priority)) { return [string]$Candidate.priority }
  return (Get-AETextPriority $Text)
}

function Get-SuggestedStoryId([string]$Text, [int]$Index) {
  $slug = "GENERAL"
  if ($Text -match '(?i)upload') { $slug = "UPLOAD" }
  elseif ($Text -match '(?i)report|diagnosis') { $slug = "REPORT" }
  elseif ($Text -match '(?i)share') { $slug = "SHARE" }
  elseif ($Text -match '(?i)export') { $slug = "EXPORT" }
  elseif ($Text -match '(?i)pay|payment|billing') { $slug = "PAYMENT" }
  elseif ($Text -match '(?i)login|auth|session') { $slug = "AUTH" }
  return "STORY-$slug-$('{0:D3}' -f $Index)"
}

function Classify-StoryCandidate($Candidate, [hashtable]$Seen, [int]$Index) {
  $text = (Get-CurationText $Candidate).Trim()
  $norm = ($text.ToLowerInvariant() -replace '\s+', ' ').Trim()
  $priority = Get-CurationPriority $Candidate $text
  $classification = "AMBIGUOUS"
  $reason = "Candidate does not clearly expose actor, goal, and verifiable outcome."
  if ([string]::IsNullOrWhiteSpace($text)) {
    $classification = "AMBIGUOUS"
    $reason = "Candidate text is empty."
  } elseif ($Seen.ContainsKey($norm)) {
    $classification = "DUPLICATE"
    $reason = "Candidate duplicates an earlier story candidate."
  } elseif ($text -match '(?i)\b(out of scope|future|later|not in scope|defer|deferred)\b') {
    $classification = "OUT_OF_SCOPE"
    $reason = "Candidate is explicitly outside the current scope or deferred."
  } elseif ($text -match '(?i)\b(modular|architecture|refactor|maintainable|code organization|layered|scalable|performance|security principle)\b') {
    $classification = "ARCHITECTURE_NOTE"
    $reason = "Candidate describes implementation or architecture guidance rather than a user-facing story."
  } elseif ($text -match '(?i)\b(test|log|metric|monitor|guard|lint|typecheck|ci|evidence)\b' -and $text -notmatch '(?i)\buser|admin|customer|student|teacher|can|uploads?|creates?|views?|shares?|exports?\b') {
    $classification = "SUPPORTING_REQUIREMENT"
    $reason = "Candidate is a supporting verification or operational requirement."
  } elseif ($text -match '(?i)\b(skill|harness|verifier|release package|package-release|final gate)\b' -and $text -match '(?i)\bmust|should|required|provide|include|exclude|validate|verify|package\b') {
    $classification = "SUPPORTING_REQUIREMENT"
    $reason = "Candidate describes harness, release, or verifier behavior rather than an end-user product story."
  } elseif (Test-AEStoryIntentText $text) {
    $classification = "VALID_STORY"
    $reason = "Contains product behavior with a verifiable target or user-facing outcome."
  }
  if (![string]::IsNullOrWhiteSpace($norm)) { $Seen[$norm] = $true }
  [PSCustomObject]@{
    candidateId = Get-CurationId $Candidate $Index
    rawText = $text
    classification = $classification
    reason = $reason
    suggestedStoryId = $(if ($classification -eq "VALID_STORY") { Get-SuggestedStoryId $text $Index } else { $null })
    priority = $priority
    source = $Candidate.source
    sourceLine = $Candidate.sourceLine
    candidate = $Candidate
  }
}

try { $candidates = Get-Content -LiteralPath $p.StoryCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
$items = @()
$seen = @{}
$idx = 1
foreach ($candidate in @($candidates.candidates)) {
  if ($null -eq $candidate) { continue }
  $items += Classify-StoryCandidate $candidate $seen $idx
  $idx++
}

$summary = [ordered]@{}
foreach ($name in @("VALID_STORY","SUPPORTING_REQUIREMENT","ARCHITECTURE_NOTE","OUT_OF_SCOPE","DUPLICATE","AMBIGUOUS")) {
  $summary[$name] = @($items | Where-Object { $_.classification -eq $name }).Count
}
$summary["validStories"] = [int]$summary["VALID_STORY"]
$summary["supportingRequirements"] = [int]$summary["SUPPORTING_REQUIREMENT"]
$summary["architectureNotes"] = [int]$summary["ARCHITECTURE_NOTE"]
$summary["outOfScope"] = [int]$summary["OUT_OF_SCOPE"]
$summary["duplicates"] = [int]$summary["DUPLICATE"]
$summary["ambiguous"] = [int]$summary["AMBIGUOUS"]

$gaps = @()
foreach ($item in @($items | Where-Object { $_.classification -eq "AMBIGUOUS" })) {
  $gapId = "GAP-STORY-CURATION-$($item.candidateId)"
  $desc = "Ambiguous story candidate requires product decision: $($item.rawText)"
  $repair = "Clarify whether this candidate is a valid story, supporting requirement, or out of scope."
  $gaps += [PSCustomObject]@{ id=$gapId; severity="PRODUCT_DECISION_REQUIRED"; description=$desc; repairTarget=$repair; source=$item.source }
  Add-Gap $ProjectRoot $round $gapId "story-curation" "PRODUCT_DECISION_REQUIRED" $desc $repair $item.source
}

$knownGaps = Join-Path $p.Docs "05-known-gaps-and-assumptions.md"
if (!(Test-Path -LiteralPath $knownGaps)) { "# Known Gaps and Assumptions`n" | Set-Content -Encoding UTF8 $knownGaps }
foreach ($item in @($items | Where-Object { $_.classification -eq "OUT_OF_SCOPE" })) {
  Add-Content -Encoding UTF8 $knownGaps "`n- OUT_OF_SCOPE story candidate $($item.candidateId): $($item.rawText)"
}

$validStoryCount = [int]$summary["VALID_STORY"]
$ambiguousCount = [int]$summary["AMBIGUOUS"]
$status = if ($items.Count -eq 0) { "MANUAL_REVIEW_REQUIRED" } elseif ($ambiguousCount -gt 0) { "PRODUCT_DECISION_REQUIRED" } elseif ($validStoryCount -eq 0) { "MANUAL_REVIEW_REQUIRED" } else { "PASS_WITH_LIMITATION" }
@{
  schemaVersion = $AE_SCHEMA_VERSION
  curatedAt = (Get-Date).ToString("s")
  status = $status
  items = $items
  summary = $summary
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.StoryCandidatesCurated

Write-LaneResult $ProjectRoot "story-curation" $status @() @((Get-RelativeEvidencePath $ProjectRoot $p.StoryCandidatesCurated),(Get-RelativeEvidencePath $ProjectRoot $knownGaps)) $gaps @("Normalize only VALID_STORY items; clarify AMBIGUOUS items before pure PASS.")
Add-VerificationResult $ProjectRoot "story-curation" $status "$validStoryCount valid story candidate(s), $ambiguousCount ambiguous candidate(s)" $p.StoryCandidatesCurated
Write-Host "[$status] story-curation: $validStoryCount valid, $ambiguousCount ambiguous"
