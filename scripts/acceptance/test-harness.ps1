param([string]$ProjectRoot = (Get-Location).Path)
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$failures = @()
$checks = @()
function Add-Check($Name, $Passed, $Details = "") {
  $script:checks += [PSCustomObject]@{ name=$Name; passed=[bool]$Passed; details=$Details }
  if (-not $Passed) { $script:failures += "${Name}: $Details" }
}

$requiredScripts = @(
  "init-harness.ps1",
  "run-all.ps1",
  "run-convergence.ps1",
  "run-final-gate.ps1",
  "run-verifier-dependencies.ps1",
  "run-requirement-extract.ps1",
  "run-requirement-section-map.ps1",
  "run-requirement-coverage.ps1",
  "run-requirement-verify.ps1",
  "run-story-extract.ps1",
  "run-story-curate.ps1",
  "run-story-normalize.ps1",
  "run-story-test-generate.ps1",
  "run-story-test-materialize.ps1",
  "run-generated-story-tests.ps1",
  "run-story-quality-gate.ps1",
  "run-story-verify.ps1",
  "run-story-final-report.ps1",
  "run-harness-self-eval.ps1",
  "run-harness-score.ps1",
  "run-harness-gap-repair.ps1",
  "run-ui-capture.ps1",
  "run-ui-compare.ps1",
  "run-contract-map.ps1",
  "run-contract-verify.ps1",
  "run-frontend-test.ps1",
  "run-backend-test.ps1",
  "run-e2e-flow.ps1",
  "run-acceptance-compare.ps1",
  "run-compare-requirements.ps1",
  "run-compare-ui.ps1",
  "run-gap-repair.ps1",
  "write-handoff.ps1",
  "resume-convergence.ps1",
  "export-todo-from-gaps.ps1",
  "run-codex-supervisor.ps1",
  "run-report-integrity.ps1",
  "run-secret-guard.ps1",
  "run-status.ps1",
  "test-harness.ps1"
)
foreach ($script in $requiredScripts) {
  Add-Check "script exists: $script" (Test-Path -LiteralPath (Join-Path $PSScriptRoot $script)) "missing script"
}
Add-Check "worker prompt exists" (Test-Path -LiteralPath (Join-Path $PSScriptRoot "worker-prompt.txt")) "worker-prompt.txt missing"
foreach ($script in @("capture-ui.mjs","compare-ui.mjs")) {
  Add-Check "node verifier exists: $script" (Test-Path -LiteralPath (Join-Path $PSScriptRoot $script)) "missing node verifier"
}
Add-Check "release package script exists" (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) "package-release.ps1")) "scripts/package-release.ps1 missing"
Add-Check "resume-convergence.ps1 exists" (Test-Path -LiteralPath (Join-Path $PSScriptRoot "resume-convergence.ps1")) "resume-convergence.ps1 missing"

$tokens = $null
$parseErrors = $null
$allPs1 = Get-ChildItem -LiteralPath $PSScriptRoot -Filter *.ps1 -File -Recurse -ErrorAction SilentlyContinue
foreach ($script in $allPs1) {
  $tokens = $null
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$parseErrors)
  Add-Check "parse: $($script.Name)" ($null -eq $parseErrors -or $parseErrors.Count -eq 0) (($parseErrors | ForEach-Object { $_.Message }) -join "; ")
}
$packageScriptPath = Join-Path (Split-Path -Parent $PSScriptRoot) "package-release.ps1"
if (Test-Path -LiteralPath $packageScriptPath) {
  $tokens = $null
  $parseErrors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile($packageScriptPath, [ref]$tokens, [ref]$parseErrors)
  Add-Check "parse: package-release.ps1" ($null -eq $parseErrors -or $parseErrors.Count -eq 0) (($parseErrors | ForEach-Object { $_.Message }) -join "; ")
}

if (Test-CommandExists "node") {
  foreach ($script in @("capture-ui.mjs","compare-ui.mjs")) {
    $scriptPath = Join-Path $PSScriptRoot $script
    if (Test-Path -LiteralPath $scriptPath) {
      & node --check $scriptPath | Out-Null
      Add-Check "node syntax: $script" ($LASTEXITCODE -eq 0) "node --check failed"
    }
  }
}

$runConvergenceText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-convergence.ps1") -Raw
Add-Check "run-convergence supports MaxRounds default 5" ($runConvergenceText -match '\[int\]\$MaxRounds\s*=\s*5') "MaxRounds default is not 5"
Add-Check "run-convergence supports ResetConvergence" ($runConvergenceText -match '\[switch\]\$ResetConvergence') "ResetConvergence parameter missing"
Add-Check "run-convergence supports Strict" ($runConvergenceText -match '\[switch\]\$Strict') "Strict parameter missing"
Add-Check "run-convergence supports Codex supervisor mode" ($runConvergenceText -match '\[switch\]\$UseCodexSupervisor' -and $runConvergenceText -match 'export-todo-from-gaps\.ps1' -and $runConvergenceText -match 'run-codex-supervisor\.ps1') "Codex supervisor mode missing"
Add-Check "run-convergence runs v1.9 verifier stages" ($runConvergenceText -match 'run-requirement-section-map\.ps1' -and $runConvergenceText -match 'run-generated-story-tests\.ps1' -and $runConvergenceText -match 'run-story-quality-gate\.ps1' -and $runConvergenceText -match 'run-story-final-report\.ps1') "v1.9 stages missing from convergence loop"
Add-Check "run-convergence writes resumable handoff" ($runConvergenceText -match 'write-handoff\.ps1' -and $runConvergenceText -match 'convergence round \$round started' -and $runConvergenceText -match 'REPAIR_REQUIRED after convergence round \$round' -and $runConvergenceText -match 'final gate completed') "run-convergence handoff hooks missing"

$writeHandoffText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "write-handoff.ps1") -Raw
Add-Check "write-handoff creates latest handoff" ($writeHandoffText -match 'latest' -and $writeHandoffText -match 'HANDOFF\.md' -and $writeHandoffText -match 'run-id\.txt') "write-handoff does not create latest handoff/run-id"
Add-Check "write-handoff records required resume fields" ($writeHandoffText -match 'Open HARD_FAIL / IN_SCOPE_GAP' -and $writeHandoffText -match 'Commands Run' -and $writeHandoffText -match 'Modified Files' -and $writeHandoffText -match 'Prohibit ResetConvergence') "write-handoff missing required fields"

$resumeText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "resume-convergence.ps1") -Raw
Add-Check "resume-convergence reads latest state files" ($resumeText -match 'HANDOFF\.md' -and $resumeText -match 'machine-summary\.json' -and $resumeText -match 'gap-list\.json' -and $resumeText -match 'repair-plan\.md' -and $resumeText -match 'next-agent-action\.md') "resume-convergence latest state reads missing"
Add-Check "resume-convergence does not use -ResetConvergence" ($resumeText -notmatch '-ResetConvergence') "resume-convergence must not pass -ResetConvergence"

$exportTodoText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "export-todo-from-gaps.ps1") -Raw
Add-Check "export-todo-from-gaps reads latest repair state" ($exportTodoText -match 'gap-list\.json' -and $exportTodoText -match 'repair-plan\.md' -and $exportTodoText -match 'next-agent-action\.md' -and $exportTodoText -match 'TODO\.md') "TODO export does not read latest gap/repair state"
Add-Check "export-todo-from-gaps writes required task fields" ($exportTodoText -match 'Allowed files' -and $exportTodoText -match 'Required verification' -and $exportTodoText -match 'Evidence' -and $exportTodoText -match 'HARD_FAIL') "TODO export missing required task fields"

$supervisorText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-codex-supervisor.ps1") -Raw
Add-Check "run-codex-supervisor launches fresh codex workers" ($supervisorText -match 'codex exec' -and $supervisorText -match 'worker-prompt\.txt' -and $supervisorText -match 'MaxWorkerRounds') "supervisor worker loop missing"
Add-Check "run-codex-supervisor preserves convergence state" ($supervisorText -notmatch '-ResetConvergence' -and $supervisorText -match 'write-handoff\.ps1' -and $supervisorText -match 'TODO\.md') "supervisor must not reset convergence and must update handoff"

$runUiCaptureText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-ui-capture.ps1") -Raw
Add-Check "run-ui-capture invokes default capture-ui.mjs" ($runUiCaptureText -match 'capture-ui\.mjs') "default capture-ui.mjs call missing"
Add-Check "run-ui-capture checks verifier dependencies" ($runUiCaptureText -match 'run-verifier-dependencies\.ps1') "verifier dependency check missing"
Add-Check "run-ui-capture treats ui-target screens as capture targets" ($runUiCaptureText -match '\$hasUiVerificationTargets' -and $runUiCaptureText -match '\$requiredTargetScreens') "ui-target screens are not counted as capture targets"
Add-Check "run-ui-capture supports uiMapping" ($runUiCaptureText -match 'Get-HarnessObjectListValue \$ProjectRoot "uiMapping"' -and $runUiCaptureText -match 'mappingSource') "uiMapping support missing from UI capture"

$runUiCompareText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-ui-compare.ps1") -Raw
Add-Check "run-ui-compare invokes default compare-ui.mjs" ($runUiCompareText -match 'compare-ui\.mjs') "default compare-ui.mjs call missing"
Add-Check "run-ui-compare checks verifier dependencies" ($runUiCompareText -match 'run-verifier-dependencies\.ps1') "verifier dependency check missing"
Add-Check "run-ui-compare enforces required uiMapping screenshots" ($runUiCompareText -match 'Required uiMapping' -and $runUiCompareText -match 'actual screenshot') "required uiMapping screenshot gate missing"

$compareUiText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "compare-ui.mjs") -Raw
Add-Check "compare-ui handles different image dimensions" ($compareUiText -match 'function cropPng' -and $compareUiText -match 'pixelDiffSizeMismatch') "dimension mismatch handling missing"

$runFinalGateText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-final-gate.ps1") -Raw
Add-Check "run-final-gate supports Strict" ($runFinalGateText -match '\[switch\]\$Strict') "Strict parameter missing"
foreach ($json in @("requirement-coverage.json","requirement-verifier.json","ui-capture.json","ui-verifier.json","contract-verifier.json","frontend-test.json","backend-test.json","e2e-flow.json","report-integrity.json","secret-guard.json")) {
  Add-Check "run-final-gate reads $json" ($runFinalGateText -match [regex]::Escape($json)) "$json missing from final gate required results"
}
Add-Check "run-final-gate reads story-verifier.json" ($runFinalGateText -match [regex]::Escape("story-verifier.json")) "story-verifier.json missing from final gate required results"
Add-Check "run-final-gate reads story-quality-gate.json" ($runFinalGateText -match [regex]::Escape("story-quality-gate.json")) "story-quality-gate.json missing from final gate"
Add-Check "run-final-gate reads generated-story-tests.json" ($runFinalGateText -match [regex]::Escape("generated-story-tests.json")) "generated-story-tests.json missing from final gate"
Add-Check "run-final-gate reads requirement-section-map.json" ($runFinalGateText -match [regex]::Escape("requirement-section-map.json") -and $runFinalGateText -match 'RequirementSectionMap') "requirement-section-map final gate missing"
Add-Check "run-final-gate reads story materialization and acceptance summary" ($runFinalGateText -match 'StoryMaterializedTests' -and $runFinalGateText -match 'StoryAcceptanceSummary') "story materialized tests or acceptance summary missing from final gate"
Add-Check "run-final-gate classifies final verdicts" ($runFinalGateText -match 'verdictClass' -and $runFinalGateText -match 'PASS_NEEDS_MANUAL_UI_REVIEW' -and $runFinalGateText -match 'canClaimPixelPerfect') "final verdict classification missing"
Add-Check "run-final-gate enforces P0/P1 story test point evidence" ($runFinalGateText -match 'P0/P1 story.*test point' -and $runFinalGateText -match 'Test-FinalGateEvidenceList') "P0/P1 story evidence hard gate missing"
Add-Check "run-final-gate enforces generated story test execution" ($runFinalGateText -match 'Test-GeneratedStoryTestExecuted' -and $runFinalGateText -match 'generated-story-tests did not execute') "generated story execution hard gate missing"
Add-Check "run-final-gate reads harness lane enablement" ($runFinalGateText -match 'Get-HarnessLaneEnabled' -and $runFinalGateText -match 'frontend-test' -and $runFinalGateText -match 'backend-test' -and $runFinalGateText -match 'e2e-flow' -and $runFinalGateText -match 'ui-capture') "dynamic final gate lane enablement missing"
Add-Check "run-final-gate emits disabled lane suggestions" ($runFinalGateText -match 'laneSuggestions' -and $runFinalGateText -match 'Adapter auto-detected' -and $runFinalGateText -match 'disabled') "disabled/auto-detected lane suggestions missing"
Add-Check "run-final-gate writes acceptance confidence" ($runFinalGateText -match 'acceptanceConfidence' -and $runFinalGateText -match 'confidenceFactors' -and $runFinalGateText -match 'manualReviewRemaining') "acceptance confidence fields missing"

$runContractText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-contract.ps1") -Raw
Add-Check "run-contract records frontend call methods" ($runContractText -match 'method = \$method' -and $runContractText -match 'methodMatch') "frontend call method discovery missing"
Add-Check "run-contract records backend API paths" ($runContractText -match 'path = \$routePath' -and $runContractText -match 'fastapi') "backend path discovery missing"

$runContractVerifyText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-contract-verify.ps1") -Raw
Add-Check "run-contract-verify checks frontend calls against backend routes" ($runContractVerifyText -match 'GAP-CONTRACT-FRONTEND-API-MISSING' -and $runContractVerifyText -match 'Normalize-ContractPath') "frontend/backend route matching missing"

$runAllText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-all.ps1") -Raw
Add-Check "run-all supports fast/gate/full" ($runAllText -match 'ValidateSet\("fast","gate","full"\)') "Mode ValidateSet missing"
Add-Check "run-all supports SkipCompare" ($runAllText -match '\[switch\]\$SkipCompare') "SkipCompare parameter missing"
Add-Check "run-all supports SkipFinalGate" ($runAllText -match '\[switch\]\$SkipFinalGate') "SkipFinalGate parameter missing"
Add-Check "run-all runs v1.9 stages" ($runAllText -match 'run-requirement-section-map\.ps1' -and $runAllText -match 'run-generated-story-tests\.ps1' -and $runAllText -match 'run-story-final-report\.ps1') "v1.9 stages missing from run-all"
Add-Check "run-all does not write COMPLETED verdict" ($runAllText -notmatch '"COMPLETED"|''COMPLETED''') "COMPLETED still appears as a status"
Add-Check "run-all writes handoff after each verifier lane" ($runAllText -match 'verifier lane \$s completed' -and $runAllText -match 'write-handoff\.ps1') "run-all per-lane handoff hook missing"

$libText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "lib.ps1") -Raw
foreach ($token in @("RequirementSectionMap","StoryCandidates","StoryCandidatesCurated","StoryTarget","StoryTestMatrix","StoryStatus","StoryMaterializedTests","StoryQualityGate","StoryAcceptanceSummary","HarnessScorecard")) {
  Add-Check "lib exposes $token" ($libText -match $token) "$token path missing from lib.ps1"
}
Add-Check "lib parses uiMapping object arrays" ($libText -match 'function Get-HarnessObjectListValue') "Get-HarnessObjectListValue missing"
Add-Check "Invoke-Gate returns clean boolean" ($libText -match '\$output\s*=\s*& \$Command' -and $libText -match 'Tee-Object -FilePath \$log \| Out-Host') "Invoke-Gate must not emit command output into boolean callers"

Add-Check "exit code PASS" ((Get-AEExitCode "PASS") -eq 0) "PASS exit code must be 0"
Add-Check "exit code PASS_WITH_LIMITATION" ((Get-AEExitCode "PASS_WITH_LIMITATION") -eq 3) "PASS_WITH_LIMITATION exit code must be 3"
Add-Check "exit code REPAIR_REQUIRED" ((Get-AEExitCode "REPAIR_REQUIRED") -eq 2) "REPAIR_REQUIRED exit code must be 2"
Add-Check "exit code HARD_FAIL" ((Get-AEExitCode "HARD_FAIL") -eq 1) "HARD_FAIL exit code must be 1"
Add-Check "exit code BLOCKED" ((Get-AEExitCode "BLOCKED") -eq 4) "BLOCKED exit code must be 4"
Add-Check "Normalize-AEVerdict COMPLETE is not PASS" ((Normalize-AEVerdict "COMPLETE") -ne "PASS") "COMPLETE must not normalize to PASS"
Add-Check "Normalize-AEVerdict COMPLETED is not PASS" ((Normalize-AEVerdict "COMPLETED") -ne "PASS") "COMPLETED must not normalize to PASS"

$requiredDocs = @(
  "STATUS_SEMANTICS.md",
  "QUALITY_GATES.md",
  "GOLDEN_RULES.md",
  "03-story-map.md",
  "04-story-test-matrix.md",
  "harness-self-eval-report.md",
  "harness-repair-plan.md"
)
foreach ($doc in $requiredDocs) {
  $docPath = Join-Path $p.Docs $doc
  if (!(Test-Path -LiteralPath $docPath)) {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "init-harness.ps1") -ProjectRoot $ProjectRoot | Out-Null
  }
  Add-Check "doc exists: $doc" (Test-Path -LiteralPath $docPath) "missing docs/auto-execute/$doc"
}

if (!(Test-Path -LiteralPath $p.HarnessConfig)) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "init-harness.ps1") -ProjectRoot $ProjectRoot | Out-Null
}
try {
  $harnessText = Get-Content -LiteralPath $p.HarnessConfig -Raw
  Add-Check "harness.yml supports verifierDependencies" ($harnessText -match 'verifierDependencies\s*:') "verifierDependencies section missing"
  Add-Check "harness.yml defaults no dependency mutation" ($harnessText -match 'allowInstallDevDependencies\s*:\s*false' -and $harnessText -match 'allowEphemeralNpx\s*:\s*true') "safe verifier dependency defaults missing"
  Add-Check "harness.yml supports visual config" ($harnessText -match 'visual\s*:' -and $harnessText -match 'diffThreshold') "visual diff config missing"
  Add-Check "harness.yml supports uiMapping" ($harnessText -match '(?m)^uiMapping\s*:') "uiMapping section missing"
  Add-Check "harness.yml supports resumable handoff policy" ($harnessText -match '(?m)^resumable\s*:' -and $harnessText -match 'HANDOFF\.md' -and $harnessText -match 'prohibitResetOnResume\s*:\s*true') "resumable handoff policy missing"
  Add-Check "harness.yml supports supervisor policy" ($harnessText -match '(?m)^supervisor\s*:' -and $harnessText -match 'maxWorkerRounds\s*:\s*20' -and $harnessText -match 'oneTaskPerWorker\s*:\s*true') "supervisor policy missing"
  Add-Check "harness.yml supports lanes.enabled" ($harnessText -match '(?m)^\s{2}frontend\s*:' -and $harnessText -match '(?m)^\s{4}enabled\s*:') "lanes.enabled entries missing"
} catch {
  Add-Check "harness.yml readable" $false $_.Exception.Message
}

try {
  $machineProbe = Get-Content -LiteralPath $p.MachineSummary -Raw | ConvertFrom-Json
  $machineProbe | Add-Member -NotePropertyName testHarnessProbeAt -NotePropertyValue (Get-Date).ToString("s") -Force
  $machineProbe | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.MachineSummary
  Add-Check "machine-summary writable" $true ""
} catch {
  Add-Check "machine-summary writable" $false $_.Exception.Message
}

try {
  $gapProbe = Get-Content -LiteralPath $p.GapListJson -Raw | ConvertFrom-Json
  $gapProbe | Add-Member -NotePropertyName testHarnessProbeAt -NotePropertyValue (Get-Date).ToString("s") -Force
  $gapProbe | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.GapListJson
  Add-Check "gap-list writable" $true ""
} catch {
  Add-Check "gap-list writable" $false $_.Exception.Message
}

try {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "test-harness handoff probe" | Out-Null
  $latestDir = Join-Path $p.Docs "latest"
  Add-Check "docs/auto-execute/latest/HANDOFF.md can be created" (Test-Path -LiteralPath (Join-Path $latestDir "HANDOFF.md")) "HANDOFF.md was not created"
  Add-Check "docs/auto-execute/latest/run-id.txt can be read" ((Test-Path -LiteralPath (Join-Path $latestDir "run-id.txt")) -and ![string]::IsNullOrWhiteSpace((Get-Content -LiteralPath (Join-Path $latestDir "run-id.txt") -Raw))) "run-id.txt missing or empty"
} catch {
  Add-Check "latest handoff writable" $false $_.Exception.Message
}

try {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-report-integrity.ps1") -ProjectRoot $ProjectRoot -Mode fast | Out-Null
  Add-Check "report-integrity runnable" ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) "exit $LASTEXITCODE"
} catch {
  Add-Check "report-integrity runnable" $false $_.Exception.Message
}

try {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-secret-guard.ps1") -ProjectRoot $ProjectRoot -Mode fast | Out-Null
  Add-Check "secret-guard runnable" ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 4 -or $null -eq $LASTEXITCODE) "exit $LASTEXITCODE"
} catch {
  Add-Check "secret-guard runnable" $false $_.Exception.Message
}

foreach ($script in @("run-harness-self-eval.ps1","run-harness-score.ps1","run-harness-gap-repair.ps1")) {
  $text = Get-Content -LiteralPath (Join-Path $PSScriptRoot $script) -Raw
  Add-Check "$script uses v1.9 score/self-loop files" ($text -match 'Harness(SelfEvalReport|Scorecard|GapList|RepairPlan)|harness-self-eval') "missing harness self-evaluation artifacts"
}

$depText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-verifier-dependencies.ps1") -Raw
Add-Check "verifier dependencies prefer ephemeral npx" ($depText -match 'allowEphemeralNpx' -and $depText -match 'PASS_WITH_LIMITATION' -and $depText -match 'dependencyMutation') "ephemeral dependency policy missing"
Add-Check "lib schema version is v2.0" ($libText -match '\$AE_SCHEMA_VERSION\s*=\s*"2\.0"') "schema version must be 2.0"
$storyExtractText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-story-extract.ps1") -Raw
Add-Check "Chinese PRD extraction requires intent signals" ($libText -match 'Test-AERequirementIntentText' -and $libText -match 'Test-AEStoryIntentText' -and $storyExtractText -notmatch 'IsCJKUnifiedIdeographs') "Chinese PRD extraction still accepts broad CJK-only lines"
Add-Check "verifier dependency diagnostics explain resolution" ($depText -match 'toolchainDiagnostics' -and $depText -match 'packageDiagnostics' -and $depText -match 'resolutionSummary') "dependency diagnostics fields missing"
$e2eText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-e2e-flow.ps1") -Raw
Add-Check "E2E distinguishes environment from code failure" ($e2eText -match 'failureClass' -and $e2eText -match 'Test-AEEnvironmentFailureText' -and $e2eText -match 'BLOCKED_BY_ENVIRONMENT') "E2E failure classification missing"
$generatedStoryText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-generated-story-tests.ps1") -Raw
Add-Check "generated story tests emit E2E environment classification" ($generatedStoryText -match 'e2eEnvironment' -and $generatedStoryText -match 'e2eClassification' -and $generatedStoryText -match 'ENVIRONMENT_BLOCKER' -and $generatedStoryText -match 'CODE_OR_FLOW_FAILURE') "generated-story-tests E2E diagnostics missing"
Add-Check "E2E flow emits E2E environment classification" ($e2eText -match 'e2eEnvironment' -and $e2eText -match 'e2eClassification' -and $e2eText -match 'ENVIRONMENT_BLOCKER' -and $e2eText -match 'CODE_OR_FLOW_FAILURE') "e2e-flow diagnostics missing"
Add-Check "UI verifier emits layered per-screen status" ($runUiCompareText -match 'uiLayerSummary' -and $runUiCompareText -match 'finalUiStatus' -and $runUiCompareText -match 'canClaimPixelPerfect' -and $runFinalGateText -match 'finalUiStatus') "UI layered per-screen status missing"
Add-Check "UI mapping priority documented in UI scripts" ($runUiCaptureText -match 'mappingPriority' -and $runUiCompareText -match 'UI mapping priority' -and $runUiCompareText -match 'Auto-guessed UI mappings') "UI mapping priority or auto-guess rule missing"
Add-Check "final gate explains non-pure PASS with fixed headings" ($runFinalGateText -match 'purePassBlockedBy' -and $runFinalGateText -match 'nonPurePassExplanation' -and $runFinalGateText -match 'Why Not Pure PASS\?' -and $runFinalGateText -match 'Why This Is PASS' -and $runFinalGateText -match 'Secret guard' -and $runFinalGateText -match 'Report integrity') "non-pure PASS explanation missing"

$sectionMapText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-requirement-section-map.ps1") -Raw
Add-Check "requirement-section-map treats command examples as documentation" ($sectionMapText.Contains("documentation") -and $sectionMapText.Contains('$auto-execute') -and $sectionMapText.Contains("resume-convergence")) "command examples can still be misclassified as implementation gaps"

$reportIntegrityText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "run-report-integrity.ps1") -Raw
Add-Check "report-integrity checks Markdown fences only in markdown files" ($reportIntegrityText -match 'GetExtension\(\$file\).*\.md' -and $reportIntegrityText -match 'unmatched Markdown code fence') "JSON strings with code fences may be false-positive report-integrity failures"

$packageText = if (Test-Path -LiteralPath $packageScriptPath) { Get-Content -LiteralPath $packageScriptPath -Raw } else { "" }
Add-Check "package-release uses clean allowlist" ($packageText -match 'harness.yml.template' -and $packageText -match 'scripts\\acceptance' -and $packageText -match 'templates\\docs\\auto-execute' -and $packageText -match 'meta-tests\\fixtures') "release allowlist missing"
Add-Check "package-release rejects old run artifacts" ($packageText -match 'docs/auto-execute/results' -and $packageText -match 'docs/auto-execute/runs' -and $packageText -match 'machine-summary\.json' -and $packageText -match 'evidence-manifest\.json' -and $packageText -match 'AUTO_EXECUTE_DELIVERY_REPORT') "release forbidden-artifact checks missing"
Add-Check "package-release requires resumable and supervisor scripts" ($packageText -match 'write-handoff\.ps1' -and $packageText -match 'resume-convergence\.ps1' -and $packageText -match 'run-codex-supervisor\.ps1' -and $packageText -match 'export-todo-from-gaps\.ps1' -and $packageText -match 'worker-prompt\.txt') "release manifest requirement for resumable/supervisor scripts missing"

$statusPath = Join-Path $p.Results "test-harness.json"
@{
  schemaVersion = $AE_SCHEMA_VERSION
  lane = "test-harness"
  status = $(if ($failures.Count -eq 0) { "PASS" } else { "HARD_FAIL" })
  updatedAt = (Get-Date).ToString("s")
  checks = $checks
  failures = $failures
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $statusPath

if ($failures.Count -eq 0) {
  Write-Host "[PASS] test-harness"
  exit 0
}

Write-Host "ERROR: test-harness found $($failures.Count) failure(s)"
$failures | ForEach-Object { Write-Host "- $_" }
exit 1
