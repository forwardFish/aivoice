param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

$uiMappings = Get-HarnessObjectListValue $ProjectRoot "uiMapping"
if ($uiMappings.Count -gt 0) {
  try { $existingTarget = Get-Content -LiteralPath $p.UiTarget -Raw | ConvertFrom-Json } catch { $existingTarget = $null }
  $existingScreens = if ($null -ne $existingTarget -and $null -ne $existingTarget.screens) { @($existingTarget.screens) } else { @() }
  $mappedScreens = @()
  $mapIndex = 1
  foreach ($mapping in $uiMappings) {
    $id = if (![string]::IsNullOrWhiteSpace([string]$mapping.id)) { [string]$mapping.id } else { "UI-MAP-$('{0:D3}' -f $mapIndex)" }
    $existing = @($existingScreens | Where-Object { $_.id -eq $id } | Select-Object -First 1)
    $screen = if ($null -ne $existing) { $existing } else { [PSCustomObject]@{} }
    $screen | Add-Member -NotePropertyName id -NotePropertyValue $id -Force
    $screen | Add-Member -NotePropertyName reference -NotePropertyValue ([string]$mapping.reference) -Force
    $screen | Add-Member -NotePropertyName route -NotePropertyValue ([string]$mapping.route) -Force
    $screen | Add-Member -NotePropertyName viewport -NotePropertyValue ([string]$mapping.viewport) -Force
    $screen | Add-Member -NotePropertyName required -NotePropertyValue ($mapping.required -ne $false) -Force
    $screen | Add-Member -NotePropertyName mappingSource -NotePropertyValue "harness.yml:uiMapping" -Force
    if ([string]::IsNullOrWhiteSpace([string]$screen.status)) { $screen | Add-Member -NotePropertyName status -NotePropertyValue "PENDING" -Force }
    $mappedScreens += $screen
    $mapIndex++
  }
  @{
    schemaVersion = $AE_SCHEMA_VERSION
    generatedAt = (Get-Date).ToString("s")
    status = "PENDING"
    mappingSource = "harness.yml:uiMapping"
    mappingPriority = @("harness.yml uiMapping","UIReferences auto discovery","filename route guess","manual review")
    screens = $mappedScreens
  } | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $p.UiTarget
}

$uiRefs = @()
foreach ($item in (Get-HarnessListValue $ProjectRoot "docs" "ui")) {
  $candidate = Resolve-ProjectEvidencePath $ProjectRoot $item
  if (Test-Path -LiteralPath $candidate) {
    $resolved = Get-Item -LiteralPath $candidate
    if ($resolved.PSIsContainer) {
      $uiRefs += Get-ChildItem -LiteralPath $resolved.FullName -Recurse -File -Include *.png,*.jpg,*.jpeg,*.webp,*.gif,*.html -ErrorAction SilentlyContinue
    } else {
      $uiRefs += $resolved
    }
  }
}
foreach ($dir in @((Join-Path $ProjectRoot "docs\UI"), (Join-Path $ProjectRoot "docs\design\UI"), (Join-Path $ProjectRoot "docs\pic"), (Join-Path $ProjectRoot "docs\design"))) {
  if (Test-Path -LiteralPath $dir) {
    $uiRefs += Get-ChildItem -LiteralPath $dir -Recurse -File -Include *.png,*.jpg,*.jpeg,*.webp,*.gif,*.html -ErrorAction SilentlyContinue
  }
}

$idx = 1
$candidates = @()
foreach ($ref in ($uiRefs | Sort-Object FullName -Unique)) {
  $candidates += [PSCustomObject]@{
    id = "UI-$('{0:D3}' -f $idx)"
    reference = Get-RelativeEvidencePath $ProjectRoot $ref.FullName
    kind = $ref.Extension.TrimStart(".").ToLowerInvariant()
    status = "CANDIDATE"
    mappingSource = "UIReferences auto discovery"
  }
  $idx++
}
@{
  schemaVersion = $AE_SCHEMA_VERSION
  candidates = $candidates
  generatedAt = (Get-Date).ToString("s")
  status = $(if ($candidates.Count -gt 0) { "CANDIDATE" } else { "EMPTY" })
  mappingPriority = @("harness.yml uiMapping","UIReferences auto discovery","filename route guess","manual review")
  note = "UI mapping priority is harness.yml uiMapping, UIReferences auto discovery, filename route guess, then manual review. Actual screenshots must be captured and mapped in ui-target.json before final PASS; auto-guessed mapping cannot claim pure PASS without screenshot and diff evidence."
} | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $p.UiCandidates

try { $uiTarget = Get-Content -LiteralPath $p.UiTarget -Raw | ConvertFrom-Json } catch { $uiTarget = $null }
$targetScreens = if ($null -ne $uiTarget -and $null -ne $uiTarget.screens) { @($uiTarget.screens) } else { @() }
$requiredTargetScreens = @($targetScreens | Where-Object {
  $_.required -ne $false -and $_.status -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED")
})
$hasUiVerificationTargets = ($candidates.Count -gt 0 -or $requiredTargetScreens.Count -gt 0)

$cmd = Get-HarnessConfigValue $ProjectRoot "commands" "uiCapture" ""
$baseUrl = Get-HarnessConfigValue $ProjectRoot "commands" "uiBaseUrl" "http://127.0.0.1:3000"
$startCommand = Get-HarnessConfigValue $ProjectRoot "commands" "uiStart" ""
$commands = @()
$blockers = @()
$captureDetails = $null
$status = if ($hasUiVerificationTargets) { "MANUAL_REVIEW_REQUIRED" } else { "DEFERRED" }
if (![string]::IsNullOrWhiteSpace($cmd)) {
  Push-Location $ProjectRoot
  try {
    $script = [scriptblock]::Create($cmd)
    $ok = Invoke-Gate $ProjectRoot "ui-capture:configured" $script "ui-capture.log"
    $commands += @{ command=$cmd; status=$(if ($ok) { "PASS" } else { "HARD_FAIL" }); log="docs/auto-execute/logs/ui-capture.log" }
    $status = if ($ok) { "PASS_WITH_LIMITATION" } else { "HARD_FAIL" }
    if ($ok) { $blockers += "Configured capture ran; agent must map produced screenshots into ui-target.json." }
  } finally {
      Pop-Location
  }
} elseif ($hasUiVerificationTargets) {
  $captureScript = Join-Path $PSScriptRoot "capture-ui.mjs"
  if ((Test-CommandExists "node") -and (Test-Path -LiteralPath $captureScript)) {
    try {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-verifier-dependencies.ps1") -ProjectRoot $ProjectRoot -Mode $Mode -Packages @("playwright")
    } catch {
      Add-VerificationResult $ProjectRoot "ui-capture:dependencies" "PASS_WITH_LIMITATION" $_.Exception.Message ""
    }
    $log = Join-Path $p.Logs "ui-capture.log"
    Push-Location $ProjectRoot
    try {
      $env:AE_UI_BASE_URL = $baseUrl
      $env:AE_START_COMMAND = $startCommand
      & node $captureScript --project-root $ProjectRoot --base-url $baseUrl *>&1 | Tee-Object -FilePath $log
      $code = $LASTEXITCODE
      $commands += @{ command="node scripts/acceptance/capture-ui.mjs --project-root `"$ProjectRoot`" --base-url $baseUrl"; status=$(if ($code -eq 0) { "PASS" } elseif ($code -in @(3,4)) { "PASS_WITH_LIMITATION" } else { "HARD_FAIL" }); log=Get-RelativeEvidencePath $ProjectRoot $log }
      if ($code -eq 0) {
        $status = "PASS"
      } elseif ($code -eq 3) {
        $status = "MANUAL_REVIEW_REQUIRED"
        $blockers += "Default Playwright capture could not fully automate screenshots. Check docs/auto-execute/results/ui-capture.json."
      } elseif ($code -eq 4) {
        $status = "DOCUMENTED_BLOCKER"
        $blockers += "Default Playwright capture was blocked by local server/tooling availability. Check docs/auto-execute/results/ui-capture.json."
      } else {
        $status = "HARD_FAIL"
        $blockers += "Default Playwright capture failed. Check docs/auto-execute/logs/ui-capture.log."
      }
      Add-EvidenceItem $ProjectRoot "log" $log "default UI capture log"
      Add-EvidenceItem $ProjectRoot "visual" (Join-Path $p.Results "ui-capture.json") "default UI capture result"
      try { $captureDetails = Get-Content -LiteralPath (Join-Path $p.Results "ui-capture.json") -Raw | ConvertFrom-Json } catch { $captureDetails = $null }
    } finally {
      Remove-Item Env:\AE_UI_BASE_URL -ErrorAction SilentlyContinue
      Remove-Item Env:\AE_START_COMMAND -ErrorAction SilentlyContinue
      Pop-Location
    }
  } else {
    $blockers += "UI references found, but Node or capture-ui.mjs is unavailable. Configure commands.uiCapture or install project screenshot tooling."
  }
} else {
  $blockers += "No UI references discovered."
}

Add-EvidenceItem $ProjectRoot "visual" $p.UiCandidates "UI candidates"
Write-LaneResult $ProjectRoot "ui-capture" $status $commands @((Get-RelativeEvidencePath $ProjectRoot $p.UiCandidates),(Get-RelativeEvidencePath $ProjectRoot $p.UiTarget),(Get-RelativeEvidencePath $ProjectRoot $p.Screenshots)) $blockers @("Map references and actual screenshots into ui-target.json; do not claim UI alignment without actual visual evidence.","UI mapping priority: harness.yml uiMapping, UIReferences auto discovery, filename guess, manual review.")
if ($null -ne $captureDetails) {
  $resultPath = Join-Path $p.Results "ui-capture.json"
  try { $lane = Get-Content -LiteralPath $resultPath -Raw | ConvertFrom-Json } catch { $lane = [PSCustomObject]@{} }
  $lane | Add-Member -NotePropertyName baseUrl -NotePropertyValue $captureDetails.baseUrl -Force
  $lane | Add-Member -NotePropertyName viewports -NotePropertyValue @($captureDetails.viewports) -Force
  $lane | Add-Member -NotePropertyName screenshots -NotePropertyValue @($captureDetails.screenshots) -Force
  $lane | Add-Member -NotePropertyName captureBlockers -NotePropertyValue @($captureDetails.blockers) -Force
  $lane | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $resultPath
}
Add-VerificationResult $ProjectRoot "ui-capture" $status "$($candidates.Count) UI reference candidate(s), $($requiredTargetScreens.Count) required target screen(s), $($uiMappings.Count) configured uiMapping item(s)" $p.UiCandidates
Write-Host "[$status] ui-capture: $($candidates.Count) reference candidate(s), $($requiredTargetScreens.Count) required target screen(s), $($uiMappings.Count) mapping item(s)"
