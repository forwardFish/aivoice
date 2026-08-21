param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

try { $target = Get-Content -LiteralPath $p.RequirementTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $candidates = Get-Content -LiteralPath $p.RequirementCandidates -Raw | ConvertFrom-Json } catch { $candidates = $null }
try { $sectionMap = Get-Content -LiteralPath $p.RequirementSectionMap -Raw | ConvertFrom-Json } catch { $sectionMap = $null }
$gaps = @()
$limitations = @()

function Add-ReqVerifierGap($Id, $Severity, $Description, $RepairTarget, $Source) {
  $script:gaps += [PSCustomObject]@{ id=$Id; severity=$Severity; description=$Description; repairTarget=$RepairTarget; source=$Source }
  Add-Gap $ProjectRoot $round $Id "requirement" $Severity $Description $RepairTarget $Source
}
function Get-ReqValues($Req, [string[]]$Names) {
  $values = @()
  foreach ($name in $Names) {
    $value = $Req.$name
    if ($null -eq $value) { continue }
    if ($value -is [System.Array]) {
      foreach ($item in @($value)) {
        if (![string]::IsNullOrWhiteSpace([string]$item)) { $values += $item }
      }
    } elseif (![string]::IsNullOrWhiteSpace([string]$value)) {
      $values += $value
    }
  }
  return @($values)
}
function Get-EvidencePathString($EvidenceItem) {
  if ($null -eq $EvidenceItem) { return "" }
  if ($EvidenceItem -is [string]) { return $EvidenceItem }
  foreach ($name in @("path","file","screenshot","log","result","evidence")) {
    if (![string]::IsNullOrWhiteSpace([string]$EvidenceItem.$name)) { return [string]$EvidenceItem.$name }
  }
  return [string]$EvidenceItem
}

if ($null -eq $target -or $null -eq $target.requirements) {
  Add-ReqVerifierGap "GAP-REQ-TARGET-MISSING" "HARD_FAIL" "requirement-target.json is missing or invalid." "Create normalized requirement-target.json from PRD/docs with P0/P1/P2, acceptance criteria, status, and evidence." (Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget)
} else {
  $reqs = @($target.requirements)
  $candidateCount = if ($null -ne $candidates -and $null -ne $candidates.candidates) { @($candidates.candidates).Count } else { 0 }
  if ($reqs.Count -eq 0 -and $candidateCount -gt 0) {
    Add-ReqVerifierGap "GAP-REQ-CANDIDATES-NOT-NORMALIZED" "HARD_FAIL" "Requirement candidates exist but requirement-target.json has no normalized requirements." "Normalize requirement-candidates.json into requirement-target.json before implementation or final PASS." (Get-RelativeEvidencePath $ProjectRoot $p.RequirementCandidates)
  }
  foreach ($req in $reqs) {
    $id = if ([string]::IsNullOrWhiteSpace([string]$req.id)) { "REQ-UNKNOWN" } else { [string]$req.id }
    $priority = [string]$req.priority
    $status = [string]$req.status
    $source = if (![string]::IsNullOrWhiteSpace([string]$req.source)) { [string]$req.source } else { Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget }
    $inScope = $status -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED")
    if ($status -eq "CANDIDATE" -or $req.normalized -eq $false) {
      Add-ReqVerifierGap "GAP-$id-CANDIDATE" "HARD_FAIL" "Requirement $id is still a candidate." "Normalize $id with concrete acceptance criteria, priority, surface/API/UI mapping, tests, and evidence." $source
    }
    if ($priority -in @("P0","P1") -and $inScope) {
      if ($status -notin @("PASS","PASS_WITH_LIMITATION")) {
        Add-ReqVerifierGap "GAP-$id-STATUS" "IN_SCOPE_GAP" "P0/P1 requirement $id status is $status, not PASS/PASS_WITH_LIMITATION." "Implement or repair $id, then update requirement-target.json with truthful evidence." $source
      }
      $acceptance = Get-ReqValues $req @("acceptance","acceptanceCriteria","criteria")
      if ($acceptance.Count -eq 0) {
        Add-ReqVerifierGap "GAP-$id-ACCEPTANCE" "IN_SCOPE_GAP" "P0/P1 requirement $id has no acceptance criteria." "Add concrete acceptance criteria for $id before claiming it is verifiable." $source
      }
      $surfaces = Get-ReqValues $req @("surfaces","surface","routes","route","screens","ui","uis")
      $apis = Get-ReqValues $req @("apis","api","endpoints","endpoint")
      $flows = Get-ReqValues $req @("flows","flow","e2e","fullFlow")
      if (($surfaces.Count + $apis.Count + $flows.Count) -eq 0) {
        Add-ReqVerifierGap "GAP-$id-TARGET-MAP" "IN_SCOPE_GAP" "P0/P1 requirement $id has no surface/API/full-flow mapping." "Map $id to at least one page/screen, API/contract, or E2E flow." $source
      }
      $testTargets = Get-ReqValues $req @("tests","test","evidenceRequired","verification","verificationRequired")
      if ($testTargets.Count -eq 0) {
        Add-ReqVerifierGap "GAP-$id-TEST-MAP" "IN_SCOPE_GAP" "P0/P1 requirement $id has no test or evidenceRequired mapping." "Specify the unit/API/E2E/screenshot evidence required for $id." $source
      }
      if ($status -eq "PASS_WITH_LIMITATION") {
        $limitationReason = Get-ReqValues $req @("limitation","limitations","limitationReason","notes")
        if ($limitationReason.Count -eq 0) {
          Add-ReqVerifierGap "GAP-$id-LIMITATION-REASON" "IN_SCOPE_GAP" "Requirement $id is PASS_WITH_LIMITATION without a limitation reason." "Record the exact limitation and why it is acceptable." $source
        }
      }
      $evidence = @($req.evidence) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
      if ($evidence.Count -eq 0) {
        Add-ReqVerifierGap "GAP-$id-EVIDENCE" "HARD_FAIL" "P0/P1 requirement $id has no evidence." "Attach command logs, screenshots, API results, or tests proving $id." $source
      } else {
        foreach ($ev in $evidence) {
          $evPath = Get-EvidencePathString $ev
          if (!(Test-ProjectEvidencePath $ProjectRoot $evPath)) {
            Add-ReqVerifierGap "GAP-$id-EVIDENCE-MISSING" "HARD_FAIL" "P0/P1 requirement $id references missing evidence: $evPath." "Create or correct the evidence path for $id." $source
            break
          }
        }
      }
    }
    if ($status -in @("PASS_WITH_LIMITATION","DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","MANUAL_REVIEW_REQUIRED","PRODUCT_DECISION_REQUIRED")) {
      $limitations += [PSCustomObject]@{ id=$id; status=$status; source=$source }
    }
  }
}

if ($null -ne $sectionMap -and $null -ne $sectionMap.sections) {
  foreach ($section in @($sectionMap.sections | Where-Object { $_.priority -in @("P0","P1") -and $_.coverageStatus -eq "IN_SCOPE_GAP" })) {
    $sectionId = if ([string]::IsNullOrWhiteSpace([string]$section.sectionId)) { "SEC-UNKNOWN" } else { [string]$section.sectionId }
    Add-ReqVerifierGap "GAP-$sectionId-REQ-STORY-COVERAGE" "IN_SCOPE_GAP" "P0/P1 PRD section $sectionId has no requirement/story coverage." "Map section '$($section.title)' into requirement-target.json and story-target.json." $section.source
  }
}

$statusOut = if ($gaps.Count -gt 0) { "HARD_FAIL" } elseif ($limitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" }
Write-LaneResult $ProjectRoot "requirement-verifier" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $p.RequirementTarget),(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)) $gaps @("Close requirement gaps, then rerun run-requirement-verify.ps1 and final gate.")
Add-VerificationResult $ProjectRoot "requirement-verifier" $statusOut "$($gaps.Count) hard/in-scope requirement gap(s), $($limitations.Count) limitation(s)" $p.RequirementTarget
Write-Host "[$statusOut] requirement-verifier: $($gaps.Count) gap(s), $($limitations.Count) limitation(s)"
