param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$docFiles = Get-AERequirementSourceFiles $ProjectRoot
$ignoredRequirementReferences = Get-AEIgnoredRequirementReferences $ProjectRoot

$requirements = @()
$idx = 1
function Test-RequirementLine([string]$Text) {
  return (Test-AERequirementIntentText $Text)
}

function Get-RequirementClauses([string]$Text) {
  $splitPattern = ';|,|\uFF1B|\uFF0C|\u3001|\s+and\s+|\u548c|\u4ee5\u53ca'
  if ($Text -notmatch $splitPattern) { return @($Text) }
  $clauses = @($Text -split $splitPattern | ForEach-Object { $_.Trim() } | Where-Object { $_.Length -ge 6 })
  if ($clauses.Count -eq 0) { return @($Text) }
  return @($clauses)
}

foreach ($file in ($docFiles | Sort-Object FullName -Unique | Select-Object -First 20)) {
  try { $lines = @(Get-Content -LiteralPath $file.FullName -ErrorAction Stop) } catch { continue }
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.Length -lt 12) { continue }
    if (Test-RequirementLine $t) {
      foreach ($clause in (Get-RequirementClauses $t)) {
        if (-not (Test-RequirementLine $clause)) { continue }
        $requirements += @{
          id = "REQ-$('{0:D3}' -f $idx)"
          source = Get-RelativeEvidencePath $ProjectRoot $file.FullName
          description = $clause
          priority = Get-AETextPriority $t
          surface = ""
          acceptance = @()
          normalized = $false
          status = "CANDIDATE"
          evidence = @()
        }
        $idx++
        if ($idx -gt 80) { break }
      }
    }
  }
  if ($idx -gt 80) { break }
}

$status = if ($requirements.Count -gt 0) { "CANDIDATE" } else { "MANUAL_REVIEW_REQUIRED" }
@{
  schemaVersion = $AE_SCHEMA_VERSION
  candidates = $requirements
  sourceDocuments = @($docFiles | ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.FullName })
  ignoredReferences = $ignoredRequirementReferences
  generatedAt = (Get-Date).ToString("s")
  status = $status
  note = $(if ($requirements.Count -gt 0) { "Auto-extracted requirements are candidates only. Agent must normalize them into P0/P1/P2 acceptance criteria with surface/test/evidence before implementation or final PASS." } else { "No requirements auto-extracted. Agent must fill from PRD/docs." })
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.RequirementCandidates

if (!(Test-Path -LiteralPath $p.RequirementTarget)) {
  @{ schemaVersion = $AE_SCHEMA_VERSION; requirements = @(); generatedAt = (Get-Date).ToString("s"); status = "PENDING"; note = "Normalize requirement-candidates.json into this file. This target file must not contain CANDIDATE items for final PASS." } | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.RequirementTarget
}

Add-EvidenceItem $ProjectRoot "other" $p.RequirementCandidates "requirement candidates"
Add-EvidenceItem $ProjectRoot "other" $p.RequirementTarget "requirement target"
Add-VerificationResult $ProjectRoot "requirements-candidates" $status "Requirement candidates generated with $($requirements.Count) candidate item(s)" $p.RequirementCandidates
Write-LaneResult $ProjectRoot "requirements-candidates" $(if ($status -eq "CANDIDATE") { "MANUAL_REVIEW_REQUIRED" } else { $status }) @() @((Get-RelativeEvidencePath $ProjectRoot $p.RequirementCandidates),(Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget)) $(if ($requirements.Count -eq 0) { @("No requirements auto-extracted") } else { @("Auto-extracted requirements are candidates and must be normalized into requirement-target.json") }) @("Normalize requirement-candidates.json into requirement-target.json before final convergence.")
Write-Host "[$status] requirements-candidates: $($requirements.Count) item(s)"
