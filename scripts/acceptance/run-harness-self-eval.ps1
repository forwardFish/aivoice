param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
Ensure-Dir $p.MetaTestFixtures
$workspaceRoot = Join-Path $p.MetaTests "workspaces"
Ensure-Dir $workspaceRoot

function Write-FixtureIfMissing($Name, $Content) {
  $path = Join-Path $p.MetaTestFixtures $Name
  if (!(Test-Path -LiteralPath $path)) { $Content | Set-Content -Encoding UTF8 $path }
  return $path
}

$simplePrd = Write-FixtureIfMissing "simple-prd.md" "User can upload homework, the system generates a diagnostic report, and the system provides a 7-day improvement plan."
$simpleUi = Write-FixtureIfMissing "simple-ui-map.json" (@{ screens=@(@{ id="UPLOAD_REPORT"; route="/dashboard/upload"; reference="docs/UI/upload-report.png"; required=$true }) } | ConvertTo-Json -Depth 10)
$expectedStories = Write-FixtureIfMissing "expected-stories.json" (@{ requirements=@("REQ-UPLOAD","REQ-REPORT","REQ-7DAY-PLAN"); stories=@("STORY-UPLOAD-REPORT"); testPoints=@("route","api","visual") } | ConvertTo-Json -Depth 10)
$badRequirement = Write-FixtureIfMissing "bad-requirement-missing-evidence.json" (@{ schemaVersion=$AE_SCHEMA_VERSION; requirements=@(@{ id="REQ-BAD-EVIDENCE"; priority="P0"; description="Must have evidence"; acceptance=@("Evidence exists"); surfaces=@("/dashboard"); tests=@("route"); status="PASS"; normalized=$true; evidence=@() }) } | ConvertTo-Json -Depth 10)
$badUi = Write-FixtureIfMissing "bad-ui-missing-screenshot.json" (@{ schemaVersion=$AE_SCHEMA_VERSION; screens=@(@{ id="BAD-UI"; route="/dashboard"; reference="docs/UI/reference.png"; status="PASS"; structureStatus="PASS"; visualStatus="PASS"; required=$true }); pixelPerfectRequired=$false } | ConvertTo-Json -Depth 10)
$badStory = Write-FixtureIfMissing "bad-story-no-testpoints.json" (@{ schemaVersion=$AE_SCHEMA_VERSION; stories=@(@{ storyId="STORY-BAD-NO-TESTPOINTS"; epicId="EPIC-BAD"; sprintId="SPRINT-P0"; priority="P0"; title="Bad story"; actor="user"; goal="prove bad story fails"; sourceRequirements=@("REQ-BAD"); surfaces=@("/bad"); apis=@(); acceptanceCriteria=@("must fail without test points"); testPoints=@(); evidenceRequired=@("route smoke"); status="PASS"; normalized=$true }) } | ConvertTo-Json -Depth 20)

$tests = @()
function Add-SelfEvalTest($Name, [bool]$Passed, $Details, $Evidence = @()) {
  $script:tests += [PSCustomObject]@{ name=$Name; passed=[bool]$Passed; details=$Details; evidence=@($Evidence) }
}
function New-MetaWorkspace($Name) {
  $path = Join-Path $workspaceRoot $Name
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
  Ensure-Dir $path
  Ensure-Dir (Join-Path $path "docs")
  Ensure-Dir (Join-Path $path "docs\UI")
  return $path
}
function Invoke-MetaScript($Script, $Root, $Extra = @()) {
  $scriptPath = Join-Path $PSScriptRoot $Script
  & powershell -ExecutionPolicy Bypass -File $scriptPath -ProjectRoot $Root @Extra | Out-Null
  return $LASTEXITCODE
}

$simpleRoot = New-MetaWorkspace "simple-prd"
"User can upload homework, the system generates a diagnostic report, and the system provides a 7-day improvement plan." | Set-Content -Encoding UTF8 (Join-Path $simpleRoot "docs\simple-prd.md")
Copy-Item -LiteralPath $simpleUi -Destination (Join-Path $simpleRoot "docs\auto-ui-map.json") -Force
Invoke-MetaScript "init-harness.ps1" $simpleRoot @("-RequirementDocs", @((Join-Path $simpleRoot "docs\simple-prd.md"))) | Out-Null
Invoke-MetaScript "run-requirement-extract.ps1" $simpleRoot | Out-Null
Invoke-MetaScript "run-story-extract.ps1" $simpleRoot | Out-Null
$simplePaths = Get-AEPaths $simpleRoot
try { $reqCandidates = Get-Content -LiteralPath $simplePaths.RequirementCandidates -Raw | ConvertFrom-Json } catch { $reqCandidates = $null }
try { $storyCandidates = Get-Content -LiteralPath $simplePaths.StoryCandidates -Raw | ConvertFrom-Json } catch { $storyCandidates = $null }
$reqDescriptions = if ($null -ne $reqCandidates) { @($reqCandidates.candidates | ForEach-Object { [string]$_.description }) } else { @() }
$hasUpload = (@($reqDescriptions | Where-Object { $_ -match "upload|homework|上传" }).Count -gt 0)
$hasReport = (@($reqDescriptions | Where-Object { $_ -match "report|diagnostic|报告|诊断" }).Count -gt 0)
$hasPlan = (@($reqDescriptions | Where-Object { $_ -match "plan|7|计划" }).Count -gt 0)
$storyText = if ($null -ne $storyCandidates) { (@($storyCandidates.candidates | ForEach-Object { [string]$_.description }) -join "`n") } else { "" }
Add-SelfEvalTest "PRD fixture generates requirement candidates" ($hasUpload -and $hasReport -and $hasPlan) "Expected upload/report/7-day-plan requirement candidates; got $(@($reqDescriptions).Count)." @((Get-RelativeEvidencePath $simpleRoot $simplePaths.RequirementCandidates))
Add-SelfEvalTest "PRD fixture generates story candidates" ($storyText -match "upload|上传" -and $storyText -match "report|diagnostic|报告|诊断") "Expected upload/report story candidate." @((Get-RelativeEvidencePath $simpleRoot $simplePaths.StoryCandidates))

$storyRoot = New-MetaWorkspace "story-materialization"
Invoke-MetaScript "init-harness.ps1" $storyRoot | Out-Null
$storyPaths = Get-AEPaths $storyRoot
@{ schemaVersion=$AE_SCHEMA_VERSION; stories=@(@{
  storyId="STORY-UPLOAD-REPORT"; epicId="EPIC-LEARNING"; sprintId="SPRINT-P0"; priority="P0"
  title="Upload homework and generate report"; actor="student"; goal="upload homework and receive a diagnostic report"
  sourceRequirements=@("REQ-UPLOAD","REQ-REPORT","REQ-7DAY-PLAN"); surfaces=@("/dashboard/upload"); apis=@("POST /api/uploads")
  acceptanceCriteria=@("Upload page is reachable","Upload API exists","Report visual evidence is captured")
  testPoints=@(
    @{ id="TP-UPLOAD-ROUTE"; storyId="STORY-UPLOAD-REPORT"; type="route"; target="/dashboard/upload"; expected="route reachable"; status="PENDING"; evidence=@() },
    @{ id="TP-UPLOAD-API"; storyId="STORY-UPLOAD-REPORT"; type="api"; target="POST /api/uploads"; expected="api reachable"; status="PENDING"; evidence=@() },
    @{ id="TP-UPLOAD-VISUAL"; storyId="STORY-UPLOAD-REPORT"; type="visual"; target="docs/UI/upload-report.png"; expected="visual captured"; status="PENDING"; evidence=@() }
  )
  evidenceRequired=@("route smoke","API smoke","UI verifier"); status="PASS_WITH_LIMITATION"; normalized=$true
}) } | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $storyPaths.StoryTarget
Invoke-MetaScript "run-story-test-generate.ps1" $storyRoot | Out-Null
Invoke-MetaScript "run-story-test-materialize.ps1" $storyRoot | Out-Null
Invoke-MetaScript "run-story-quality-gate.ps1" $storyRoot | Out-Null
try { $mat = Get-Content -LiteralPath $storyPaths.StoryMaterializedTests -Raw | ConvertFrom-Json } catch { $mat = $null }
try { $quality = Get-Content -LiteralPath $storyPaths.StoryQualityGate -Raw | ConvertFrom-Json } catch { $quality = $null }
$matPoints = if ($null -ne $mat -and $null -ne $mat.stories) { @($mat.stories[0].testPoints) } else { @() }
$matOk = ($matPoints.Count -ge 3 -and @($matPoints | Where-Object { $_.materializationStatus -in @("GENERATED","BOUND_TO_UI_VERIFIER") -and ![string]::IsNullOrWhiteSpace([string]$_.command) -and ![string]::IsNullOrWhiteSpace([string]$_.evidenceOutput) }).Count -ge 3)
Add-SelfEvalTest "Story test points materialize to commands/evidence" $matOk "Expected route/api/visual materialization with commands and evidence outputs." @((Get-RelativeEvidencePath $storyRoot $storyPaths.StoryMaterializedTests))
Add-SelfEvalTest "Story quality gate accepts normalized story" ($null -ne $quality -and $quality.status -in @("PASS","PASS_WITH_LIMITATION")) "Expected story quality gate to pass normalized P0 story." @((Get-RelativeEvidencePath $storyRoot $storyPaths.StoryQualityGate))

$badReqRoot = New-MetaWorkspace "bad-requirement"
Invoke-MetaScript "init-harness.ps1" $badReqRoot | Out-Null
$badReqPaths = Get-AEPaths $badReqRoot
Copy-Item -LiteralPath $badRequirement -Destination $badReqPaths.RequirementTarget -Force
$badReqExit = Invoke-MetaScript "run-final-gate.ps1" $badReqRoot
try { $badReqFinal = Get-Content -LiteralPath $badReqPaths.MachineSummary -Raw | ConvertFrom-Json } catch { $badReqFinal = $null }
Add-SelfEvalTest "Bad requirement missing evidence fails final gate" ($badReqExit -ne 0) "Expected final gate non-zero for missing evidence; exit=$badReqExit verdict=$($badReqFinal.finalVerdict)." @((Get-RelativeEvidencePath $badReqRoot $badReqPaths.MachineSummary))

$badUiRoot = New-MetaWorkspace "bad-ui"
Invoke-MetaScript "init-harness.ps1" $badUiRoot | Out-Null
$badUiPaths = Get-AEPaths $badUiRoot
Copy-Item -LiteralPath $badUi -Destination $badUiPaths.UiTarget -Force
Invoke-MetaScript "run-compare-ui.ps1" $badUiRoot | Out-Null
try { $badUiResult = Get-Content -LiteralPath (Join-Path $badUiPaths.Results "compare-ui.json") -Raw | ConvertFrom-Json } catch { $badUiResult = $null }
Add-SelfEvalTest "Bad UI missing screenshot fails UI verifier" ($null -ne $badUiResult -and $badUiResult.status -eq "HARD_FAIL") "Expected compare-ui HARD_FAIL when PASS UI lacks actual screenshot." @("docs/auto-execute/results/compare-ui.json")

$badStoryRoot = New-MetaWorkspace "bad-story"
Invoke-MetaScript "init-harness.ps1" $badStoryRoot | Out-Null
$badStoryPaths = Get-AEPaths $badStoryRoot
Copy-Item -LiteralPath $badStory -Destination $badStoryPaths.StoryTarget -Force
Invoke-MetaScript "run-story-quality-gate.ps1" $badStoryRoot | Out-Null
try { $badStoryQuality = Get-Content -LiteralPath $badStoryPaths.StoryQualityGate -Raw | ConvertFrom-Json } catch { $badStoryQuality = $null }
Add-SelfEvalTest "Bad story without testPoints fails story gate" ($null -ne $badStoryQuality -and $badStoryQuality.status -eq "HARD_FAIL") "Expected story quality gate HARD_FAIL for P0 story without testPoints." @((Get-RelativeEvidencePath $badStoryRoot $badStoryPaths.StoryQualityGate))

$finalGateText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-final-gate.ps1") -Raw
$strictSemanticOk = ($finalGateText -match "Strict mode does not allow PASS_WITH_LIMITATION" -and $finalGateText -match "Strict mode requires P0/P1 story")
Add-SelfEvalTest "PASS_WITH_LIMITATION strict semantics are encoded" $strictSemanticOk "Expected final gate to reject limitations in Strict mode." @("scripts/acceptance/run-final-gate.ps1")

$failed = @($tests | Where-Object { -not $_.passed })
$statusOut = if ($failed.Count -eq 0) { "PASS" } else { "HARD_FAIL" }
$jsonPath = Join-Path $p.Results "harness-self-eval.json"
@{ schemaVersion=$AE_SCHEMA_VERSION; lane="harness-self-eval"; status=$statusOut; generatedAt=(Get-Date).ToString("s"); tests=$tests; fixtures=@((Get-RelativeEvidencePath $ProjectRoot $simplePrd),(Get-RelativeEvidencePath $ProjectRoot $simpleUi),(Get-RelativeEvidencePath $ProjectRoot $expectedStories),(Get-RelativeEvidencePath $ProjectRoot $badRequirement),(Get-RelativeEvidencePath $ProjectRoot $badUi),(Get-RelativeEvidencePath $ProjectRoot $badStory)) } | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $jsonPath

$lines = @("# Harness Self-Evaluation Report","","Generated: $(Get-Date)","","- Status: $statusOut","- Passed: $(@($tests | Where-Object { $_.passed }).Count)/$($tests.Count)","","| Test | Status | Details | Evidence |","|---|---|---|---|")
foreach ($test in $tests) {
  $testStatus = if ($test.passed) { "PASS" } else { "HARD_FAIL" }
  $details = ([string]$test.details) -replace '\|','/'
  $evidence = if (@($test.evidence).Count -gt 0) { (@($test.evidence) -join "<br>") } else { "" }
  $lines += "| $($test.name) | $testStatus | $details | $evidence |"
}
$lines | Set-Content -Encoding UTF8 $p.HarnessSelfEvalReport

Write-LaneResult $ProjectRoot "harness-self-eval" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $p.HarnessSelfEvalReport),"docs/auto-execute/results/harness-self-eval.json") $failed @("Run run-harness-score.ps1, then run-harness-gap-repair.ps1 if score is below 90.")
try {
  $laneResult = Get-Content -LiteralPath $jsonPath -Raw | ConvertFrom-Json
  $laneResult | Add-Member -NotePropertyName tests -NotePropertyValue $tests -Force
  $laneResult | Add-Member -NotePropertyName fixtures -NotePropertyValue @((Get-RelativeEvidencePath $ProjectRoot $simplePrd),(Get-RelativeEvidencePath $ProjectRoot $simpleUi),(Get-RelativeEvidencePath $ProjectRoot $expectedStories),(Get-RelativeEvidencePath $ProjectRoot $badRequirement),(Get-RelativeEvidencePath $ProjectRoot $badUi),(Get-RelativeEvidencePath $ProjectRoot $badStory)) -Force
  $laneResult | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $jsonPath
} catch {}
Add-VerificationResult $ProjectRoot "harness-self-eval" $statusOut "$(@($tests | Where-Object { $_.passed }).Count)/$($tests.Count) meta-test(s) passed" $p.HarnessSelfEvalReport
Write-Host "[$statusOut] harness-self-eval: $(@($tests | Where-Object { $_.passed }).Count)/$($tests.Count) passed"
exit $(if ($statusOut -eq "PASS") { 0 } else { 1 })
