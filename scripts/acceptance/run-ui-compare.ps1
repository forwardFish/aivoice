param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast", [switch]$Strict)
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$threshold = Get-HarnessConfigValue $ProjectRoot "visual" "diffThreshold" "0.03"
$customCompare = Get-HarnessConfigValue $ProjectRoot "commands" "uiCompare" ""

$diffScript = Join-Path $PSScriptRoot "compare-ui.mjs"
$diffStatus = ""
$diffBlockers = @()
if (![string]::IsNullOrWhiteSpace($customCompare)) {
  $diffLog = Join-Path $p.Logs "ui-compare-custom.log"
  Push-Location $ProjectRoot
  try {
    $script = [scriptblock]::Create($customCompare)
    $ok = Invoke-Gate $ProjectRoot "ui-compare:configured" $script "ui-compare-custom.log"
    $diffStatus = if ($ok) { "PASS" } else { "HARD_FAIL" }
  } finally { Pop-Location }
} elseif ((Test-CommandExists "node") -and (Test-Path -LiteralPath $diffScript)) {
  try {
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-verifier-dependencies.ps1") -ProjectRoot $ProjectRoot -Mode $Mode -Packages @("pixelmatch","pngjs")
  } catch {
    Add-VerificationResult $ProjectRoot "ui-compare:dependencies" "PASS_WITH_LIMITATION" $_.Exception.Message ""
  }
  $diffLog = Join-Path $p.Logs "ui-pixel-diff.log"
  Push-Location $ProjectRoot
  try {
    $strictArg = if ($Strict) { "true" } else { "false" }
    & node $diffScript --project-root $ProjectRoot --threshold $threshold --strict $strictArg *>&1 | Tee-Object -FilePath $diffLog
    $diffCode = $LASTEXITCODE
    Add-EvidenceItem $ProjectRoot "log" $diffLog "UI pixel diff log"
    Add-EvidenceItem $ProjectRoot "visual" (Join-Path $p.Results "ui-pixel-diff.json") "UI pixel diff result"
    $pixelDiffPath = Join-Path $p.Results "ui-pixel-diff.json"
    try {
      if (Test-Path -LiteralPath $pixelDiffPath) {
        $diffResult = Get-Content -LiteralPath $pixelDiffPath -Raw -ErrorAction Stop | ConvertFrom-Json
        $diffStatus = Normalize-AEVerdict $diffResult.status
        $diffBlockers += @($diffResult.blockers)
      } else {
        $diffStatus = if ($diffCode -eq 0) { "PASS" } elseif ($diffCode -in @(3,4)) { "PASS_NEEDS_MANUAL_UI_REVIEW" } else { "HARD_FAIL" }
        $diffBlockers += "compare-ui.mjs did not produce docs/auto-execute/results/ui-pixel-diff.json."
      }
    } catch {
      $diffStatus = if ($diffCode -eq 0) { "PASS" } elseif ($diffCode -in @(3,4)) { "PASS_NEEDS_MANUAL_UI_REVIEW" } else { "HARD_FAIL" }
    }
  } finally {
    Pop-Location
  }
  if ($diffStatus -in @("MANUAL_REVIEW_REQUIRED","PASS_NEEDS_MANUAL_UI_REVIEW") -and (Test-CommandExists "python")) {
    $pythonDiffScript = Join-Path $PSScriptRoot "compare-ui.py"
    if (Test-Path -LiteralPath $pythonDiffScript) {
      $pythonDiffLog = Join-Path $p.Logs "ui-pixel-diff-python.log"
      Push-Location $ProjectRoot
      try {
        & python $pythonDiffScript --project-root $ProjectRoot --threshold $threshold --strict $strictArg *>&1 | Tee-Object -FilePath $pythonDiffLog
        if (!(Test-Path -LiteralPath $pythonDiffLog)) { New-Item -ItemType File -Force -Path $pythonDiffLog | Out-Null }
        Add-EvidenceItem $ProjectRoot "log" $pythonDiffLog "UI pixel diff Python fallback log"
        $pixelDiffPath = Join-Path $p.Results "ui-pixel-diff.json"
        if (Test-Path -LiteralPath $pixelDiffPath) {
          $fallbackResult = Get-Content -LiteralPath $pixelDiffPath -Raw -ErrorAction Stop | ConvertFrom-Json
          $fallbackStatus = Normalize-AEVerdict $fallbackResult.status
          if ($fallbackStatus -notin @("MANUAL_REVIEW_REQUIRED","PASS_NEEDS_MANUAL_UI_REVIEW")) {
            $diffStatus = $fallbackStatus
            $diffBlockers = @($fallbackResult.blockers)
          }
        }
      } catch {
        Add-VerificationResult $ProjectRoot "ui-compare:python-fallback" "PASS_WITH_LIMITATION" $_.Exception.Message $pythonDiffLog
      } finally {
        Pop-Location
      }
    }
  }
} else {
  $diffStatus = "MANUAL_REVIEW_REQUIRED"
  $diffBlockers += "Node or compare-ui.mjs is unavailable; automated pixel diff did not run."
}

try {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-compare-ui.ps1") -ProjectRoot $ProjectRoot -Mode $Mode
} catch {
  Add-VerificationResult $ProjectRoot "ui-verifier" "HARD_FAIL" $_.Exception.Message ""
}

try { $compare = Get-Content -LiteralPath (Join-Path $p.Results "compare-ui.json") -Raw | ConvertFrom-Json } catch { $compare = $null }
try { $target = Get-Content -LiteralPath $p.UiTarget -Raw | ConvertFrom-Json } catch { $target = $null }
$uiMappings = Get-HarnessObjectListValue $ProjectRoot "uiMapping"
$status = if ($null -ne $compare) { Normalize-AEVerdict $compare.status } else { "HARD_FAIL" }
$blockers = @()
if ($null -eq $compare) { $blockers += "compare-ui result missing or invalid." }
$blockers += $diffBlockers
if ($status -eq "PASS" -and $diffStatus -in @("PASS_NEEDS_MANUAL_UI_REVIEW","MANUAL_REVIEW_REQUIRED")) {
  $status = "PASS_NEEDS_MANUAL_UI_REVIEW"
} elseif ($diffStatus -eq "HARD_FAIL") {
  $status = "HARD_FAIL"
} elseif ($status -eq "PASS" -and $diffStatus -eq "PASS_WITH_LIMITATION") {
  $status = "PASS_WITH_LIMITATION"
}
if ($null -ne $target -and $null -ne $target.screens) {
  foreach ($screen in @($target.screens)) {
    if ($screen.pixelPerfectStatus -eq "PASS" -and [string]::IsNullOrWhiteSpace([string]$screen.visualDiffEvidence) -and [string]::IsNullOrWhiteSpace([string]$screen.visualDiff) -and [string]::IsNullOrWhiteSpace([string]$screen.diffEvidence)) {
      $blockers += "Screen $($screen.id) claims pixelPerfectStatus PASS without visual diff evidence."
      $status = "HARD_FAIL"
    }
  }
}
foreach ($mapping in @($uiMappings | Where-Object { $_.required -ne $false })) {
  $id = [string]$mapping.id
  $screen = if ($null -ne $target -and $null -ne $target.screens) { @($target.screens | Where-Object { $_.id -eq $id } | Select-Object -First 1) } else { $null }
  if ($null -eq $screen) {
    $blockers += "Required uiMapping $id is not present in ui-target.json."
    $status = "HARD_FAIL"
    continue
  }
  $actual = ""
  foreach ($candidate in @($screen.actualScreenshot, $screen.actualScreenshotDesktop, $screen.visualEvidence, $screen.actual)) {
    if (![string]::IsNullOrWhiteSpace([string]$candidate)) { $actual = [string]$candidate; break }
  }
  if ([string]::IsNullOrWhiteSpace($actual) -or !(Test-ProjectEvidencePath $ProjectRoot $actual)) {
    $blockers += "Required uiMapping $id has no existing actual screenshot."
    $status = "HARD_FAIL"
  }
}

function First-UiEvidence($Screen, [string[]]$Names) {
  foreach ($name in $Names) {
    if (![string]::IsNullOrWhiteSpace([string]$Screen.$name)) { return [string]$Screen.$name }
  }
  return ""
}

function Test-UiEvidenceExists($ProjectRoot, [string]$EvidencePath) {
  return (![string]::IsNullOrWhiteSpace($EvidencePath) -and (Test-ProjectEvidencePath $ProjectRoot $EvidencePath))
}

function Get-UiComparisonForScreen($Comparisons, [string]$ScreenId) {
  if ([string]::IsNullOrWhiteSpace($ScreenId)) { return $null }
  return @($Comparisons | Where-Object { [string]$_.id -eq $ScreenId } | Select-Object -First 1)
}

function Get-UiFinalStatus([string]$StructureStatus, [string]$ScreenshotStatus, [string]$PixelDiffStatus, [bool]$HasReference) {
  if ($StructureStatus -eq "HARD_FAIL") { return "HARD_FAIL" }
  if ($ScreenshotStatus -eq "HARD_FAIL") { return "HARD_FAIL" }
  if (-not $HasReference) { return "MANUAL_REVIEW_REQUIRED" }
  switch ($PixelDiffStatus) {
    "PASS" { return "PASS" }
    "PASS_WITH_LIMITATION" { return "PASS_WITH_LIMITATION" }
    "HARD_FAIL" { return "HARD_FAIL" }
    "FAIL" { return "HARD_FAIL" }
    default { return "PASS_NEEDS_MANUAL_UI_REVIEW" }
  }
}

$pixelDiffResult = $null
$pixelComparisons = @()
try {
  $pixelDiffPath = Join-Path $p.Results "ui-pixel-diff.json"
  if (Test-Path -LiteralPath $pixelDiffPath) {
    $pixelDiffResult = Get-Content -LiteralPath $pixelDiffPath -Raw | ConvertFrom-Json
    $pixelComparisons = @($pixelDiffResult.comparisons)
  }
} catch {
  $pixelDiffResult = $null
  $pixelComparisons = @()
}

$requiredScreens = if ($null -ne $target -and $null -ne $target.screens) {
  @($target.screens | Where-Object { $_.required -ne $false -and $_.status -notin @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED") })
} else { @() }
$screenSummaries = @()
foreach ($screen in @($requiredScreens)) {
  $screenId = if ([string]::IsNullOrWhiteSpace([string]$screen.id)) { "UI-UNKNOWN" } else { [string]$screen.id }
  $reference = First-UiEvidence $screen @("reference","referencePath","uiReference")
  $actual = First-UiEvidence $screen @("actualScreenshot","actualScreenshotDesktop","visualEvidence","actual")
  $visualDiff = First-UiEvidence $screen @("visualDiff","visualDiffEvidence","diffEvidence")
  $hasReference = Test-UiEvidenceExists $ProjectRoot $reference
  $hasActual = Test-UiEvidenceExists $ProjectRoot $actual
  $hasDiff = Test-UiEvidenceExists $ProjectRoot $visualDiff
  $mappingSourceText = (@($screen.mappingSource, $screen.routeMappingSource, $screen.source) -join " ")
  $autoGuessedMapping = ($mappingSourceText -match "(?i)auto|guess|filename")
  $comparison = Get-UiComparisonForScreen $pixelComparisons $screenId
  $comparisonRatio = $null
  $comparisonSizeMismatch = $false
  if ($null -ne $comparison) {
    try {
      if (![string]::IsNullOrWhiteSpace([string]$comparison.ratio)) { $comparisonRatio = [double]$comparison.ratio }
    } catch { $comparisonRatio = $null }
    $comparisonSizeMismatch = ($comparison.sizeMismatch -eq $true)
  }
  $structureStatus = if (![string]::IsNullOrWhiteSpace([string]$screen.structureStatus)) {
    Normalize-AEVerdict $screen.structureStatus
  } elseif ($screen.status -in @("PASS","PASS_WITH_LIMITATION","PASS_NEEDS_MANUAL_UI_REVIEW")) {
    "PASS"
  } elseif ($screen.status -in @("HARD_FAIL","FAIL","IN_SCOPE_GAP")) {
    "HARD_FAIL"
  } else {
    "MANUAL_REVIEW_REQUIRED"
  }
  $screenshotStatus = if ($hasActual) { "PASS" } else { "HARD_FAIL" }
  $pixelDiffStatus = if ($null -ne $comparison) {
    Normalize-AEVerdict $comparison.status
  } elseif ($screen.pixelPerfectStatus -eq "PASS" -and $hasDiff) {
    "PASS"
  } elseif ($screen.pixelPerfectStatus -eq "PASS_WITH_LIMITATION") {
    "PASS_WITH_LIMITATION"
  } elseif (-not $hasActual) {
    "HARD_FAIL"
  } else {
    "MANUAL_REVIEW_REQUIRED"
  }
  $finalUiStatus = Get-UiFinalStatus $structureStatus $screenshotStatus $pixelDiffStatus $hasReference
  $canClaimPixelPerfect = ($finalUiStatus -eq "PASS" -and $hasDiff -and $pixelDiffStatus -eq "PASS")
  $knownDifferences = @()
  $requiresUiRepair = $false
  $repairSeverity = "IN_SCOPE_GAP"
  $thresholdNumber = [double]$threshold
  if ($null -ne $comparisonRatio -and $comparisonRatio -gt $thresholdNumber) {
    $requiresUiRepair = $true
    $repairSeverity = $(if ($Strict) { "HARD_FAIL" } else { "IN_SCOPE_GAP" })
    $pixelDiffStatus = "HARD_FAIL"
    $finalUiStatus = "HARD_FAIL"
    $canClaimPixelPerfect = $false
    $knownDifferences += "Pixel diff ratio $comparisonRatio exceeds threshold $thresholdNumber."
  }
  if ($comparisonSizeMismatch) {
    $requiresUiRepair = $true
    $repairSeverity = $(if ($Strict) { "HARD_FAIL" } else { "IN_SCOPE_GAP" })
    if ($Strict) {
      $pixelDiffStatus = "HARD_FAIL"
      $finalUiStatus = "HARD_FAIL"
    } elseif ($finalUiStatus -eq "PASS") {
      $pixelDiffStatus = "PASS_NEEDS_MANUAL_UI_REVIEW"
      $finalUiStatus = "PASS_NEEDS_MANUAL_UI_REVIEW"
    }
    $canClaimPixelPerfect = $false
    $knownDifferences += "Reference and actual screenshot dimensions differ."
  }
  if (-not $hasReference) { $knownDifferences += "Reference artifact is missing or not mapped." }
  if (-not $hasActual) { $knownDifferences += "Actual screenshot evidence is missing." }
  if ($null -ne $comparison -and ![string]::IsNullOrWhiteSpace([string]$comparison.reason)) { $knownDifferences += [string]$comparison.reason }
  if ($pixelDiffStatus -eq "MANUAL_REVIEW_REQUIRED") { $knownDifferences += "Pixel diff unavailable or incomplete; screenshot evidence exists only if screenshotStatus is PASS." }
  if ($autoGuessedMapping -and -not $hasDiff) { $knownDifferences += "UI mapping was auto-discovered or filename-guessed; pure PASS requires screenshot plus diff evidence." }
  if ($requiresUiRepair) {
    $roundForGap = Get-CurrentConvergenceRound $ProjectRoot
    $gapId = "ui-fidelity-$screenId"
    $gapDetail = "Required UI screen $screenId does not meet fidelity threshold. ratio=$comparisonRatio threshold=$thresholdNumber sizeMismatch=$comparisonSizeMismatch."
    Add-Gap $ProjectRoot $roundForGap $gapId "ui-fidelity" $repairSeverity $gapDetail "Repair the implemented UI for $($screen.route), recapture screenshots, and rerun run-ui-compare.ps1." (Get-RelativeEvidencePath $ProjectRoot (Join-Path $p.Results "ui-pixel-diff.json"))
    $status = "HARD_FAIL"
  }
  $screen | Add-Member -NotePropertyName structureStatus -NotePropertyValue $structureStatus -Force
  $screen | Add-Member -NotePropertyName screenshotStatus -NotePropertyValue $screenshotStatus -Force
  $screen | Add-Member -NotePropertyName pixelDiffStatus -NotePropertyValue $pixelDiffStatus -Force
  $screen | Add-Member -NotePropertyName finalUiStatus -NotePropertyValue $finalUiStatus -Force
  $screen | Add-Member -NotePropertyName canClaimPixelPerfect -NotePropertyValue ([bool]$canClaimPixelPerfect) -Force
  $screen | Add-Member -NotePropertyName knownDifferences -NotePropertyValue @($knownDifferences | Select-Object -Unique) -Force
  $screen | Add-Member -NotePropertyName pixelDiffRatio -NotePropertyValue $comparisonRatio -Force
  $screen | Add-Member -NotePropertyName sizeMismatch -NotePropertyValue ([bool]$comparisonSizeMismatch) -Force
  $screenSummaries += [PSCustomObject]@{
    id = $screenId
    route = [string]$screen.route
    reference = $reference
    actualScreenshot = $actual
    viewport = $(if (![string]::IsNullOrWhiteSpace([string]$screen.viewport)) { [string]$screen.viewport } elseif (![string]::IsNullOrWhiteSpace([string]$screen.viewportName)) { [string]$screen.viewportName } else { "" })
    structureStatus = $structureStatus
    screenshotStatus = $screenshotStatus
    pixelDiffStatus = $pixelDiffStatus
    finalUiStatus = $finalUiStatus
    canClaimPixelPerfect = [bool]$canClaimPixelPerfect
    ratio = $comparisonRatio
    sizeMismatch = [bool]$comparisonSizeMismatch
    mappingSource = $mappingSourceText.Trim()
    knownDifferences = @($knownDifferences | Select-Object -Unique)
  }
}
if ($null -ne $target -and $null -ne $target.screens) {
  $target | Add-Member -NotePropertyName updatedAt -NotePropertyValue (Get-Date).ToString("s") -Force
  $target | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $p.UiTarget
}
$structureFailures = @($screenSummaries | Where-Object { $_.structureStatus -eq "HARD_FAIL" })
$screenshotMissing = @($screenSummaries | Where-Object { $_.screenshotStatus -eq "HARD_FAIL" })
$visualLimitations = @($screenSummaries | Where-Object { $_.finalUiStatus -in @("PASS_WITH_LIMITATION","PASS_NEEDS_MANUAL_UI_REVIEW","MANUAL_REVIEW_REQUIRED") })
$pixelMissing = @($screenSummaries | Where-Object { $_.canClaimPixelPerfect -ne $true })
$pixelDiffLimitations = @($screenSummaries | Where-Object { $_.pixelDiffStatus -eq "PASS_WITH_LIMITATION" })
$pixelManual = @($screenSummaries | Where-Object { $_.pixelDiffStatus -in @("MANUAL_REVIEW_REQUIRED","PASS_NEEDS_MANUAL_UI_REVIEW") })
$uiLayerSummary = [ordered]@{
  requiredScreens = $requiredScreens.Count
  structureStatus = $(if ($requiredScreens.Count -eq 0) { "DEFERRED" } elseif ($structureFailures.Count -eq 0) { "PASS" } else { "HARD_FAIL" })
  screenshotStatus = $(if ($requiredScreens.Count -eq 0) { "DEFERRED" } elseif ($screenshotMissing.Count -eq 0) { "PASS" } else { "HARD_FAIL" })
  visualStatus = $(if ($requiredScreens.Count -eq 0) { "DEFERRED" } elseif ($structureFailures.Count -gt 0 -or $screenshotMissing.Count -gt 0) { "HARD_FAIL" } elseif ($visualLimitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" })
  pixelPerfectStatus = $(if ($requiredScreens.Count -eq 0) { "DEFERRED" } elseif ($pixelMissing.Count -eq 0) { "PASS" } elseif ($pixelManual.Count -eq 0 -and $pixelDiffLimitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" })
  pixelPerfectClaimAllowed = ($requiredScreens.Count -gt 0 -and $pixelMissing.Count -eq 0)
  statusMeaning = $(if ($status -eq "PASS") { "Structure, screenshots, visual verifier, and pixel diff passed automatically." } elseif ($status -eq "PASS_NEEDS_MANUAL_UI_REVIEW") { "Functional UI evidence exists, but visual or pixel-perfect review remains manual." } elseif ($status -eq "PASS_WITH_LIMITATION") { "UI evidence exists with documented visual limitations." } else { "UI verifier has hard gaps or missing required evidence." })
}
if (@($screenSummaries | Where-Object { $_.finalUiStatus -eq "HARD_FAIL" }).Count -gt 0) {
  $status = "HARD_FAIL"
} elseif (@($screenSummaries | Where-Object { $_.finalUiStatus -in @("PASS_NEEDS_MANUAL_UI_REVIEW","MANUAL_REVIEW_REQUIRED") }).Count -gt 0 -and $status -eq "PASS") {
  $status = "PASS_NEEDS_MANUAL_UI_REVIEW"
} elseif (@($screenSummaries | Where-Object { $_.finalUiStatus -eq "PASS_WITH_LIMITATION" }).Count -gt 0 -and $status -eq "PASS") {
  $status = "PASS_WITH_LIMITATION"
}

$uiFidelityRepairScreens = @($screenSummaries | Where-Object {
  ($null -ne $_.ratio -and [double]$_.ratio -gt [double]$threshold) -or $_.sizeMismatch -eq $true
})
if ($uiFidelityRepairScreens.Count -gt 0) {
  @(
    "# Next Agent Action",
    "",
    "Required UI fidelity gaps are still in scope. Repair the implementation before asking for manual review.",
    "",
    "## Screens",
    $($uiFidelityRepairScreens | ForEach-Object { "- $($_.id) route=$($_.route) ratio=$($_.ratio) threshold=$threshold sizeMismatch=$($_.sizeMismatch)" }),
    "",
    "## Required action",
    "Update the relevant frontend layout/styles/content, recapture screenshots, rerun run-ui-compare.ps1, then rerun acceptance comparison."
  ) | Set-Content -Encoding UTF8 $p.NextAgentAction
}

@(
  "# Visual Diff Report",
  "",
  "Generated: $(Get-Date)",
  "",
  "- UI verifier status: $status",
  "- Pixel diff status: $diffStatus",
  "- UI mapping priority: harness.yml uiMapping > UIReferences auto discovery > filename route guess > manual review",
  "- UI structure layer: $($uiLayerSummary.structureStatus)",
  "- UI screenshot layer: $($uiLayerSummary.screenshotStatus)",
  "- UI visual layer: $($uiLayerSummary.visualStatus)",
  "- UI pixel-perfect layer: $($uiLayerSummary.pixelPerfectStatus)",
  "- uiMapping entries: $($uiMappings.Count)",
  "- ui-target: $(Get-RelativeEvidencePath $ProjectRoot $p.UiTarget)",
  "- gap-list: $(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)",
  "",
  "No UI_PIXEL_PERFECT_PASS claim is valid unless ui-target.json points to existing visual diff evidence for that screen.",
  "Auto-guessed UI mappings cannot claim pure PASS unless screenshot and diff evidence both exist."
) | Set-Content -Encoding UTF8 $p.VisualDiffReport

Write-LaneResult $ProjectRoot "ui-verifier" $status @() @((Get-RelativeEvidencePath $ProjectRoot $p.UiTarget),(Get-RelativeEvidencePath $ProjectRoot $p.VisualDiffReport),(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)) $blockers @("Capture missing screenshots or visual diffs, repair UI gaps, then rerun run-ui-compare.ps1.","UI mapping priority: harness.yml uiMapping, UIReferences auto discovery, filename guess, manual review.")
$uiVerifierPath = Join-Path $p.Results "ui-verifier.json"
try {
  $uiVerifier = Get-Content -LiteralPath $uiVerifierPath -Raw | ConvertFrom-Json
  $pixelDiffPath = Join-Path $p.Results "ui-pixel-diff.json"
  if (Test-Path -LiteralPath $pixelDiffPath) {
    $pixelDiff = Get-Content -LiteralPath $pixelDiffPath -Raw | ConvertFrom-Json
  $uiVerifier | Add-Member -NotePropertyName pixelDiff -NotePropertyValue $pixelDiff -Force
  }
  $uiVerifier | Add-Member -NotePropertyName uiLayerSummary -NotePropertyValue $uiLayerSummary -Force
  $uiVerifier | Add-Member -NotePropertyName screens -NotePropertyValue $screenSummaries -Force
  $uiVerifier | Add-Member -NotePropertyName canClaimPixelPerfect -NotePropertyValue ([bool]$uiLayerSummary.pixelPerfectClaimAllowed) -Force
  $uiVerifier | Add-Member -NotePropertyName diffThreshold -NotePropertyValue $threshold -Force
  $uiVerifier | Add-Member -NotePropertyName strict -NotePropertyValue ([bool]$Strict) -Force
  $uiVerifier | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $uiVerifierPath
} catch {}
Add-VerificationResult $ProjectRoot "ui-verifier" $status "UI verifier completed with status $status" $p.VisualDiffReport
Write-Host "[$status] ui-verifier"
