param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$generatedDir = Join-Path $ProjectRoot "scripts\acceptance\generated"
$out = Join-Path $p.Results "generated-story-tests.json"
$commands = @()
$results = @()

try { $materialized = Get-Content -LiteralPath $p.StoryMaterializedTests -Raw | ConvertFrom-Json } catch { $materialized = $null }
try { $storyTarget = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $storyTarget = $null }
try { $storyMatrix = Get-Content -LiteralPath $p.StoryTestMatrix -Raw | ConvertFrom-Json } catch { $storyMatrix = $null }

function Get-GeneratedPoints($TypeNames) {
  if ($null -eq $materialized -or $null -eq $materialized.stories) { return @() }
  $points = @()
  foreach ($story in @($materialized.stories)) {
    foreach ($tp in @($story.testPoints)) {
      if ($tp.type -in $TypeNames -and $tp.materializationStatus -eq "GENERATED") {
        $tp | Add-Member -NotePropertyName storyId -NotePropertyValue $story.storyId -Force
        $points += $tp
      }
    }
  }
  return @($points)
}

function Invoke-GeneratedTest {
  param(
    [string]$Name,
    [string]$Path,
    [string]$Command,
    [string]$LogName,
    [object[]]$Points
  )
  if (@($Points).Count -eq 0) {
    return [PSCustomObject]@{ name=$Name; status="DEFERRED"; reason="No generated $Name test points are present."; command=$Command; log=""; points=@() }
  }
  if (!(Test-Path -LiteralPath $Path)) {
    return [PSCustomObject]@{ name=$Name; status="HARD_FAIL"; reason="Generated test file not found: $Path"; command=$Command; log=""; points=$Points }
  }
  $log = Join-Path $p.Logs $LogName
  Push-Location $ProjectRoot
  try {
    Write-Host "Running generated story test: $Name"
    $scriptBlock = [scriptblock]::Create($Command)
    $ok = Invoke-Gate $ProjectRoot "generated-story:$Name" $scriptBlock $LogName
    $logText = if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Raw } else { "" }
    $failureClass = if ($ok) { "none" } elseif (Test-AEEnvironmentFailureText $logText) { "environment" } else { "code-or-test" }
    $status = if ($ok) { "PASS" } elseif ($failureClass -eq "environment") { "DOCUMENTED_BLOCKER" } else { "HARD_FAIL" }
    return [PSCustomObject]@{
      name = $Name
      status = $status
      failureClass = $failureClass
      reason = $(if ($ok) { "" } elseif ($failureClass -eq "environment") { "Generated test appears blocked by local environment/tooling/server availability." } else { "Generated test executed and failed like a code/test assertion failure." })
      command = $Command
      log = Get-RelativeEvidencePath $ProjectRoot $log
      points = $Points
    }
  } finally {
    Pop-Location
  }
}

$routePoints = Get-GeneratedPoints @("route","content")
$apiPoints = Get-GeneratedPoints @("api")
$e2ePoints = Get-GeneratedPoints @("e2e","state","flow")
$routeTest = Join-Path $generatedDir "route-smoke.generated.mjs"
$apiTest = Join-Path $generatedDir "api-smoke.generated.mjs"
$e2eTest = Join-Path $generatedDir "e2e-flow.generated.spec.ts"

function Test-GeneratedNodePackage([string]$PackageName) {
  if (!(Test-CommandExists "node")) { return $false }
  & node -e "require.resolve(process.argv[1])" $PackageName *> $null
  return ($LASTEXITCODE -eq 0)
}

function Test-GeneratedPlaywrightBrowser {
  if (!(Test-GeneratedNodePackage "playwright")) { return $false }
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

function Test-BaseUrlReachable([string]$Url) {
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
  playwrightPackageAvailable = (Test-GeneratedNodePackage "playwright")
  npxAvailable = (Test-CommandExists "npx")
  browserAvailable = (Test-GeneratedPlaywrightBrowser)
  baseUrlConfigured = (![string]::IsNullOrWhiteSpace($configuredBaseUrl))
  serverReachable = (Test-BaseUrlReachable $configuredBaseUrl)
}
$e2eClassification = "NOT_APPLICABLE"

$results += Invoke-GeneratedTest -Name "route-smoke" -Path $routeTest -Command "node scripts/acceptance/generated/route-smoke.generated.mjs --project-root ." -LogName "generated-route-smoke.log" -Points $routePoints
$results += Invoke-GeneratedTest -Name "api-smoke" -Path $apiTest -Command "node scripts/acceptance/generated/api-smoke.generated.mjs --project-root ." -LogName "generated-api-smoke.log" -Points $apiPoints
if (@($e2ePoints).Count -gt 0) {
  if (-not $e2eEnvironment.npxAvailable) {
    $results += [PSCustomObject]@{ name="e2e-flow"; status="DOCUMENTED_BLOCKER"; failureClass="environment"; reason="npx is unavailable, cannot run generated Playwright E2E."; command="npx playwright test scripts/acceptance/generated/e2e-flow.generated.spec.ts"; log=""; points=$e2ePoints }
  } elseif (-not $e2eEnvironment.baseUrlConfigured) {
    $results += [PSCustomObject]@{ name="e2e-flow"; status="DOCUMENTED_BLOCKER"; failureClass="environment"; reason="No BASE_URL, PLAYWRIGHT_BASE_URL, AUTO_EXECUTE_UI_BASE_URL, or commands.uiBaseUrl is configured for generated E2E."; command="npx playwright test scripts/acceptance/generated/e2e-flow.generated.spec.ts"; log=""; points=$e2ePoints }
  } elseif (-not $e2eEnvironment.serverReachable) {
    $results += [PSCustomObject]@{ name="e2e-flow"; status="DOCUMENTED_BLOCKER"; failureClass="environment"; reason="Configured E2E base URL is not reachable: $configuredBaseUrl"; command="npx playwright test scripts/acceptance/generated/e2e-flow.generated.spec.ts"; log=""; points=$e2ePoints }
  } elseif ($e2eEnvironment.playwrightPackageAvailable -and -not $e2eEnvironment.browserAvailable) {
    $results += [PSCustomObject]@{ name="e2e-flow"; status="DOCUMENTED_BLOCKER"; failureClass="environment"; reason="Playwright browser runtime is unavailable. Run npx playwright install only if project policy allows it."; command="npx playwright test scripts/acceptance/generated/e2e-flow.generated.spec.ts"; log=""; points=$e2ePoints }
  } else {
    $results += Invoke-GeneratedTest -Name "e2e-flow" -Path $e2eTest -Command "npx playwright test scripts/acceptance/generated/e2e-flow.generated.spec.ts" -LogName "generated-e2e-flow.log" -Points $e2ePoints
  }
  $e2eResult = @($results | Where-Object { $_.name -eq "e2e-flow" } | Select-Object -Last 1)
  if ($null -ne $e2eResult) {
    $e2eClassification = switch ([string]$e2eResult.status) {
      "PASS" { "PASS" }
      "DOCUMENTED_BLOCKER" { "ENVIRONMENT_BLOCKER" }
      "BLOCKED_BY_ENVIRONMENT" { "ENVIRONMENT_BLOCKER" }
      "HARD_FAIL" { if ($e2eResult.failureClass -eq "environment") { "ENVIRONMENT_BLOCKER" } else { "CODE_OR_FLOW_FAILURE" } }
      default { "NOT_EXECUTED" }
    }
  }
} else {
  $results += [PSCustomObject]@{ name="e2e-flow"; status="DEFERRED"; reason="No generated e2e/state/flow test points are present."; command=""; log=""; points=@() }
}

$hardFailCount = @($results | Where-Object { $_.status -eq "HARD_FAIL" }).Count
$blockerCount = @($results | Where-Object { $_.status -in @("DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT") }).Count
$executedCount = @($results | Where-Object { $_.status -in @("PASS","HARD_FAIL") }).Count
$status = if ($hardFailCount -gt 0) { "HARD_FAIL" } elseif ($blockerCount -gt 0) { "DOCUMENTED_BLOCKER" } elseif ($executedCount -gt 0) { "PASS" } else { "DEFERRED" }

@{
  schemaVersion = $AE_SCHEMA_VERSION
  lane = "generated-story-tests"
  status = $status
  e2eEnvironment = $e2eEnvironment
  e2eClassification = $e2eClassification
  results = $results
  updatedAt = (Get-Date).ToString("s")
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $out

function Update-StoryPointEvidence($TestPointId, $EvidencePath, $PointStatus) {
  if ($null -ne $storyTarget -and $null -ne $storyTarget.stories) {
    foreach ($story in @($storyTarget.stories)) {
      foreach ($tp in @($story.testPoints)) {
        $id = if (![string]::IsNullOrWhiteSpace([string]$tp.id)) { [string]$tp.id } else { [string]$tp.testPointId }
        if ($id -eq $TestPointId) {
          $evidence = @($tp.evidence) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
          if ($EvidencePath -notin $evidence) { $evidence += $EvidencePath }
          $tp | Add-Member -NotePropertyName evidence -NotePropertyValue @($evidence | Sort-Object -Unique) -Force
          $tp | Add-Member -NotePropertyName status -NotePropertyValue $PointStatus -Force
        }
      }
    }
  }
  if ($null -ne $storyMatrix -and $null -ne $storyMatrix.testPoints) {
    foreach ($tp in @($storyMatrix.testPoints)) {
      $id = if (![string]::IsNullOrWhiteSpace([string]$tp.id)) { [string]$tp.id } else { [string]$tp.testPointId }
      if ($id -eq $TestPointId) {
        $evidence = @($tp.evidence) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }
        if ($EvidencePath -notin $evidence) { $evidence += $EvidencePath }
        $tp | Add-Member -NotePropertyName evidence -NotePropertyValue @($evidence | Sort-Object -Unique) -Force
        $tp | Add-Member -NotePropertyName status -NotePropertyValue $PointStatus -Force
      }
    }
  }
}

foreach ($result in @($results | Where-Object { $_.status -eq "PASS" })) {
  $evidencePath = switch ($result.name) {
    "route-smoke" { "docs/auto-execute/results/route-smoke.generated.json" }
    "api-smoke" { "docs/auto-execute/results/api-smoke.generated.json" }
    "e2e-flow" { "docs/auto-execute/results/e2e-flow.generated.json" }
    default { "docs/auto-execute/results/generated-story-tests.json" }
  }
  foreach ($point in @($result.points)) {
    Update-StoryPointEvidence $point.testPointId $evidencePath "PASS"
  }
}
if ($null -ne $storyTarget) { $storyTarget | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $p.StoryTarget }
if ($null -ne $storyMatrix) { $storyMatrix | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $p.StoryTestMatrix }

$commands = @($results | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_.command) } | ForEach-Object { @{ command=$_.command; status=$_.status; log=$_.log } })
$blockers = @($results | Where-Object { $_.status -in @("HARD_FAIL","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT") } | ForEach-Object { "$($_.name): $($_.reason)" })
Write-LaneResult $ProjectRoot "generated-story-tests" $status $commands @((Get-RelativeEvidencePath $ProjectRoot $out),"docs/auto-execute/logs/generated-route-smoke.log","docs/auto-execute/logs/generated-api-smoke.log","docs/auto-execute/logs/generated-e2e-flow.log") $blockers @("Generated story tests must execute before generated P0/P1 test points can count as evidence.")
try {
  $lane = Get-Content -LiteralPath $out -Raw | ConvertFrom-Json
  $lane | Add-Member -NotePropertyName results -NotePropertyValue $results -Force
  $lane | Add-Member -NotePropertyName e2eEnvironment -NotePropertyValue $e2eEnvironment -Force
  $lane | Add-Member -NotePropertyName e2eClassification -NotePropertyValue $e2eClassification -Force
  $lane | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $out
} catch {}
Add-VerificationResult $ProjectRoot "generated-story-tests" $status "Generated story tests executed with status $status" $out
Write-Host "[$status] generated-story-tests"
exit (Get-AEExitCode $status)
