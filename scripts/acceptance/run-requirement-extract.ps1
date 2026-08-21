param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

try {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-requirements.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
} catch {
  Add-VerificationResult $ProjectRoot "requirement-extract" "HARD_FAIL" $_.Exception.Message ""
}

try { $candidates = Get-Content -LiteralPath $p.RequirementCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
$count = if ($null -ne $candidates -and $null -ne $candidates.candidates) { @($candidates.candidates).Count } else { 0 }
$sourceDocs = if ($null -ne $candidates -and $null -ne $candidates.sourceDocuments) { @($candidates.sourceDocuments) } else { @() }
$ignoredRefs = if ($null -ne $candidates -and $null -ne $candidates.ignoredReferences) { @($candidates.ignoredReferences) } else { @(Get-AEIgnoredRequirementReferences $ProjectRoot) }
$status = if ($count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" }
$blockers = if ($count -gt 0) { @("Requirement extraction creates candidates only; normalize requirement-target.json before final PASS.") } else { @("No requirement candidates were auto-extracted; fill requirement-target.json from PRD/docs.") }

Write-LaneResult $ProjectRoot "requirement-extract" $status @() @((Get-RelativeEvidencePath $ProjectRoot $p.RequirementCandidates)) $blockers @("Normalize candidates into docs/auto-execute/requirement-target.json with priority, acceptance, surface/API/UI/test evidence.")
Add-VerificationResult $ProjectRoot "requirement-extract" $status "Extracted $count requirement candidate(s) from $($sourceDocs.Count) explicit source document(s); ignored $($ignoredRefs.Count) historical reference file(s)." $p.RequirementCandidates
Write-Host "[$status] requirement-extract: $count candidate(s), $($sourceDocs.Count) source doc(s), $($ignoredRefs.Count) ignored reference(s)"
