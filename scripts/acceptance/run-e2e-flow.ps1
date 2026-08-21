param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$cmd = Get-HarnessConfigValue $ProjectRoot "commands" "e2e" ""
$generatedStoryTestsPath = Join-Path $p.Results "generated-story-tests.json"
try { $storyTarget = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $storyTarget = $null }
try { $generatedStoryTests = Get-Content -LiteralPath $generatedStoryTestsPath -Raw | ConvertFrom-Json } catch { $generatedStoryTests = $null }
$p0p1E2EStories = @()
if ($null -ne $storyTarget -and $null -ne $storyTarget.stories) {
  $p0p1E2EStories = @($storyTarget.stories | Where-Object {
    $_.priority -in @("P0","P1") -and $_.status -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED") -and (
      $_.requiresE2E -eq $true -or
      $_.fullFlow -eq $true -or
      (@($_.testPoints) | Where-Object { $_.type -in @("e2e","state","flow") }).Count -gt 0 -or
      (Test-AEFullFlowText ((@($_.acceptanceCriteria) + @($_.acceptance) + @($_.criteria)) -join " ")) -or
      ((@($_.acceptanceCriteria) + @($_.acceptance) + @($_.criteria)) -join " ") -match "(?i)full[- ]?flow|end[- ]?to[- ]?end|e2e|完整流程|全流程|端到端|闭环"
    )
  })
}
$generatedE2EPass = $false
if ($null -ne $generatedStoryTests -and $null -ne $generatedStoryTests.results) {
  $generatedE2EPass = (@($generatedStoryTests.results | Where-Object { $_.name -eq "e2e-flow" -and $_.status -eq "PASS" }).Count -gt 0)
}
$commands = @()
$failureClass = "none"
$diagnosis = "No E2E/full-flow failure detected."
$evidenceKind = "none"
$e2eClassification = "NOT_APPLICABLE"

function Get-E2EFailureClass($Texts) {
  $joined = (@($Texts) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }) -join "`n"
  if (Test-AEEnvironmentFailureText $joined) { return "environment" }
  return "code-or-test"
}

function Test-E2ENodePackage([string]$PackageName) {
  if (!(Test-CommandExists "node")) { return $false }
  & node -e "require.resolve(process.argv[1])" $PackageName *> $null
  return ($LASTEXITCODE -eq 0)
}

function Test-E2EPlaywrightBrowser {
  if (!(Test-E2ENodePackage "playwright")) { return $false }
  $probe = @"
const { chromium } = require('playwright');
const fs = require('fs');
try {
  const exe = chromium.executablePath();
  process.exit(fs.existsSync(exe) ? 0 : 1);
} catch {
  process.exit(1);
}
"@
  & node -e $probe *> $null
  return ($LASTEXITCODE -eq 0)
}

function Test-E2EBaseUrlReachable([string]$Url) {
  if ([string]::IsNullOrWhiteSpace($Url)) { return $false }
  try {
    Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 5 *> $null
    return $true
  } catch {
    try {
      Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 5 *> $null
      return $true
    } catch {
      return $false
    }
  }
}

$configuredBaseUrl = if (![string]::IsNullOrWhiteSpace($env:PLAYWRIGHT_BASE_URL)) {
  $env:PLAYWRIGHT_BASE_URL
} elseif (![string]::IsNullOrWhiteSpace($env:BASE_URL)) {
  $env:BASE_URL
} elseif (![string]::IsNullOrWhiteSpace($env:AUTO_EXECUTE_UI_BASE_URL)) {
  $env:AUTO_EXECUTE_UI_BASE_URL
} else {
  Get-HarnessConfigValue $ProjectRoot "commands" "uiBaseUrl" ""
}
$e2eEnvironment = [ordered]@{
  playwrightPackageAvailable = (Test-E2ENodePackage "playwright")
  npxAvailable = (Test-CommandExists "npx")
  browserAvailable = (Test-E2EPlaywrightBrowser)
  baseUrlConfigured = (![string]::IsNullOrWhiteSpace($configuredBaseUrl))
  serverReachable = (Test-E2EBaseUrlReachable $configuredBaseUrl)
}

if (![string]::IsNullOrWhiteSpace($cmd)) {
  Push-Location $ProjectRoot
  try {
    $script = [scriptblock]::Create($cmd)
    $ok = Invoke-Gate $ProjectRoot "e2e-flow:configured" $script "e2e-flow.log"
    $logPath = Join-Path $p.Logs "e2e-flow.log"
    $logText = if (Test-Path -LiteralPath $logPath) { Get-Content -LiteralPath $logPath -Raw } else { "" }
    if ($ok) {
      $status = "PASS"
      $blockers = @()
      $evidenceKind = "configured-command"
      $e2eClassification = "PASS"
    } else {
      $failureClass = Get-E2EFailureClass @($logText)
      $status = if ($failureClass -eq "environment") { "BLOCKED_BY_ENVIRONMENT" } else { "HARD_FAIL" }
      $e2eClassification = if ($failureClass -eq "environment") { "ENVIRONMENT_BLOCKER" } else { "CODE_OR_FLOW_FAILURE" }
      $diagnosis = if ($failureClass -eq "environment") { "Configured E2E command appears blocked by local environment/tooling/server availability." } else { "Configured E2E command executed and failed like a code/test assertion failure." }
      $blockers = @("$diagnosis See docs/auto-execute/logs/e2e-flow.log.")
      $evidenceKind = "configured-command"
    }
    $commands += @{ command=$cmd; status=$status; log="docs/auto-execute/logs/e2e-flow.log"; failureClass=$failureClass }
  } finally {
    Pop-Location
  }
} else {
  if ($p0p1E2EStories.Count -gt 0 -and $generatedE2EPass) {
    $status = "PASS"
    $blockers = @()
    $commands += @{ command="generated story e2e"; status="PASS"; log="docs/auto-execute/results/generated-story-tests.json" }
    $evidenceKind = "generated-story-e2e"
    $e2eClassification = "PASS"
  } elseif ($p0p1E2EStories.Count -gt 0) {
    $generatedE2EResult = if ($null -ne $generatedStoryTests -and $null -ne $generatedStoryTests.results) { @($generatedStoryTests.results | Where-Object { $_.name -eq "e2e-flow" } | Select-Object -First 1) } else { $null }
    $generatedStatus = if ($null -ne $generatedE2EResult) { Normalize-AEVerdict $generatedE2EResult.status } else { "MISSING" }
    $generatedClass = if ($null -ne $generatedStoryTests -and ![string]::IsNullOrWhiteSpace([string]$generatedStoryTests.e2eClassification)) { [string]$generatedStoryTests.e2eClassification } elseif ($null -ne $generatedE2EResult -and $generatedE2EResult.failureClass -eq "environment") { "ENVIRONMENT_BLOCKER" } else { "" }
    if ($generatedStatus -in @("DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT") -or $generatedClass -eq "ENVIRONMENT_BLOCKER") {
      $status = "DOCUMENTED_BLOCKER"
      $failureClass = "environment"
      $e2eClassification = "ENVIRONMENT_BLOCKER"
      $diagnosis = "P0/P1 stories require E2E/full-flow evidence, but generated E2E is blocked by local environment/tooling/server availability."
      $reason = if ($null -ne $generatedE2EResult) { [string]$generatedE2EResult.reason } else { "generated-story-tests did not provide generated E2E details." }
      $blockers = @("$diagnosis $reason")
    } elseif ($generatedStatus -eq "HARD_FAIL") {
      $status = "HARD_FAIL"
      $failureClass = "code-or-test"
      $e2eClassification = "CODE_OR_FLOW_FAILURE"
      $diagnosis = "P0/P1 generated E2E executed and failed like a code/test assertion failure."
      $blockers = @("$diagnosis See docs/auto-execute/results/generated-story-tests.json.")
    } else {
      $status = "HARD_FAIL"
      $failureClass = "missing-verifier"
      $e2eClassification = "NOT_EXECUTED"
      $diagnosis = "P0/P1 stories require E2E/full-flow evidence, but no runnable configured or generated E2E verifier passed."
      $blockers = @("P0/P1 stories require E2E/full-flow evidence, but commands.e2e is not configured and generated E2E evidence is not PASS: $(@($p0p1E2EStories | ForEach-Object { $_.storyId }) -join ', ')")
    }
  } else {
    try {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-full-flow-smoke.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
    } catch {
      Add-VerificationResult $ProjectRoot "e2e-flow" "HARD_FAIL" $_.Exception.Message ""
    }
    try { $integration = Get-Content -LiteralPath (Join-Path $p.Results "integration.json") -Raw | ConvertFrom-Json } catch { $integration = $null }
    $status = if ($null -ne $integration) { Normalize-AEVerdict $integration.status } else { "MANUAL_REVIEW_REQUIRED" }
    $blockers = if ($null -ne $integration) { @($integration.blockers) } else { @("No configured E2E/full-flow command and no integration lane result.") }
    $evidenceKind = "integration-smoke-fallback"
    if ($status -notin @("PASS","PASS_WITH_LIMITATION","DEFERRED")) {
      $failureClass = Get-E2EFailureClass @($blockers)
      $diagnosis = if ($failureClass -eq "environment") { "Fallback full-flow smoke is blocked by environment/tooling." } else { "Fallback full-flow smoke needs project-specific E2E implementation or code/test repair." }
      $e2eClassification = if ($failureClass -eq "environment") { "ENVIRONMENT_BLOCKER" } else { "CODE_OR_FLOW_FAILURE" }
    } else {
      $e2eClassification = if ($status -eq "PASS") { "PASS" } else { "NOT_APPLICABLE" }
    }
  }
}

Write-LaneResult $ProjectRoot "e2e-flow" $status $commands @((Get-RelativeEvidencePath $ProjectRoot (Join-Path $p.Docs "FULL_FLOW_ACCEPTANCE.md")),"docs/auto-execute/logs","docs/auto-execute/results/generated-story-tests.json") $blockers @("Implement or configure a full-flow/E2E verifier for P0/P1 requirements.")
$e2eResultPath = Join-Path $p.Results "e2e-flow.json"
try {
  $e2eResult = Get-Content -LiteralPath $e2eResultPath -Raw | ConvertFrom-Json
  $e2eResult | Add-Member -NotePropertyName failureClass -NotePropertyValue $failureClass -Force
  $e2eResult | Add-Member -NotePropertyName e2eEnvironment -NotePropertyValue $e2eEnvironment -Force
  $e2eResult | Add-Member -NotePropertyName e2eClassification -NotePropertyValue $e2eClassification -Force
  $e2eResult | Add-Member -NotePropertyName diagnosis -NotePropertyValue $diagnosis -Force
  $e2eResult | Add-Member -NotePropertyName evidenceKind -NotePropertyValue $evidenceKind -Force
  $e2eResult | Add-Member -NotePropertyName p0p1E2EStoryCount -NotePropertyValue @($p0p1E2EStories).Count -Force
  $e2eResult | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $e2eResultPath
} catch {}
Add-VerificationResult $ProjectRoot "e2e-flow" $status "E2E/full-flow verifier status $status" (Join-Path $p.Results "e2e-flow.json")
Write-Host "[$status] e2e-flow"
