param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-extract" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-extract"
  exit 0
}

function Get-StoryDocFiles {
  return @(Get-AERequirementSourceFiles $ProjectRoot)
}

function Get-ActorFromText([string]$Text) {
  if ($Text -match '(?i)\badmin\b|operator') { return "admin" }
  if ($Text -match '(?i)\bteacher\b') { return "teacher" }
  if ($Text -match '(?i)\bstudent\b') { return "student" }
  if ($Text -match '(?i)\bsystem\b') { return "system" }
  return "user"
}

function Get-PriorityFromText([string]$Text) {
  if ($Text -match '(?i)\bP0\b|critical|must|required|core') { return "P0" }
  if ($Text -match '(?i)\bP1\b|should|important') { return "P1" }
  return "P2"
}

function Get-SurfacesFromText([string]$Text) {
  $items = @()
  foreach ($m in [regex]::Matches($Text, '(?<![A-Za-z0-9_])(/[A-Za-z0-9_\-\[\]\{\}/]+)')) {
    $value = $m.Groups[1].Value
    if ($value -notmatch '^/api(/|$)' -and $value -notmatch '\.(png|jpg|jpeg|webp|md|json)$') { $items += $value }
  }
  return @($items | Sort-Object -Unique)
}

function Get-ApisFromText([string]$Text) {
  $items = @()
  foreach ($m in [regex]::Matches($Text, '(?i)\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(/[A-Za-z0-9_\-\[\]\{\}/]+)')) {
    $items += "$($m.Groups[1].Value.ToUpperInvariant()) $($m.Groups[2].Value)"
  }
  foreach ($m in [regex]::Matches($Text, '(/api/[A-Za-z0-9_\-\[\]\{\}/]+)')) {
    $items += $m.Groups[1].Value
  }
  return @($items | Sort-Object -Unique)
}

function New-StoryCandidate($Id, $Source, $SourceLine, $Text, $SourceRequirements = @()) {
  $clean = ([string]$Text).Trim().Trim("-").Trim()
  [PSCustomObject]@{
    storyId = $Id
    id = $Id
    title = $(if ($clean.Length -gt 80) { $clean.Substring(0, 80) } else { $clean })
    description = $clean
    source = $Source
    sourceLine = $SourceLine
    sourceRequirements = @($SourceRequirements)
    actor = Get-ActorFromText $clean
    goal = $clean
    priority = Get-PriorityFromText $clean
    surfaces = @(Get-SurfacesFromText $clean)
    apis = @(Get-ApisFromText $clean)
    acceptanceCriteria = @($clean)
    status = "CANDIDATE"
    normalized = $false
    evidence = @()
  }
}

$candidates = @()
$idx = 1
$seen = @{}

try { $reqTarget = Get-Content -LiteralPath $p.RequirementTarget -Raw | ConvertFrom-Json } catch { $reqTarget = $null }
if ($null -ne $reqTarget -and $null -ne $reqTarget.requirements) {
  foreach ($req in @($reqTarget.requirements)) {
    if ([string]::IsNullOrWhiteSpace([string]$req.description) -and [string]::IsNullOrWhiteSpace([string]$req.title)) { continue }
    $text = if (![string]::IsNullOrWhiteSpace([string]$req.description)) { [string]$req.description } else { [string]$req.title }
    $id = "STORY-REQ-$('{0:D3}' -f $idx)"
    $candidate = New-StoryCandidate $id (Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget) 0 $text @($req.id)
    if (![string]::IsNullOrWhiteSpace([string]$req.priority)) { $candidate.priority = [string]$req.priority }
    $candidate.surfaces = @($candidate.surfaces + @($req.surfaces) + @($req.routes) + @($req.screens) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) } | Sort-Object -Unique)
    $candidate.apis = @($candidate.apis + @($req.apis) + @($req.endpoints) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) } | Sort-Object -Unique)
    $candidate.acceptanceCriteria = @(@($req.acceptance) + @($req.acceptanceCriteria) + @($candidate.acceptanceCriteria) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) } | Sort-Object -Unique)
    $key = ($candidate.description).ToLowerInvariant()
    if (!$seen.ContainsKey($key)) { $candidates += $candidate; $seen[$key] = $true; $idx++ }
  }
}

foreach ($file in (Get-StoryDocFiles | Select-Object -First 40)) {
  try { $lines = @(Get-Content -LiteralPath $file.FullName -ErrorAction Stop) } catch { continue }
  $rel = Get-RelativeEvidencePath $ProjectRoot $file.FullName
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $text = $lines[$i].Trim()
    if ($text.Length -lt 10 -or $text.Length -gt 500) { continue }
    if (-not (Test-AEStoryIntentText $text)) { continue }
    $key = "$rel|$text".ToLowerInvariant()
    if ($seen.ContainsKey($key)) { continue }
    $id = "STORY-DOC-$('{0:D3}' -f $idx)"
    $candidates += New-StoryCandidate $id $rel ($i + 1) $text @()
    $seen[$key] = $true
    $idx++
    if ($idx -gt 120) { break }
  }
  if ($idx -gt 120) { break }
}

$status = if ($candidates.Count -gt 0) { "CANDIDATE" } else { "MANUAL_REVIEW_REQUIRED" }
@{
  schemaVersion = $AE_SCHEMA_VERSION
  candidates = $candidates
  sourceDocuments = @((Get-StoryDocFiles) | ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.FullName })
  ignoredReferences = @(Get-AEIgnoredRequirementReferences $ProjectRoot)
  generatedAt = (Get-Date).ToString("s")
  status = $status
  note = "Auto-extracted stories are candidates only. Normalize into story-target.json and attach test-point evidence before final PASS."
} | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $p.StoryCandidates

Add-EvidenceItem $ProjectRoot "other" $p.StoryCandidates "story candidates"
Write-LaneResult $ProjectRoot "story-extract" $(if ($candidates.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" }) @() @((Get-RelativeEvidencePath $ProjectRoot $p.StoryCandidates)) $(if ($candidates.Count -gt 0) { @("Story extraction creates candidates only; story-target.json must be normalized.") } else { @("No story candidates auto-extracted.") }) @("Run run-story-normalize.ps1, then run-story-test-generate.ps1 and run-story-verify.ps1.")
Add-VerificationResult $ProjectRoot "story-extract" $(if ($candidates.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" }) "Extracted $($candidates.Count) story candidate(s)" $p.StoryCandidates
Write-Host "[$status] story-extract: $($candidates.Count) candidate(s)"
