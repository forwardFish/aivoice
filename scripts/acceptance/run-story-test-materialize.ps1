param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "stories" $true)) {
  Write-LaneResult $ProjectRoot "story-test-materialize" "DEFERRED" @() @() @("stories lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] story-test-materialize"
  exit 0
}

Ensure-Dir $p.Generated

function Get-MaterializeValues($Obj, [string[]]$Names) {
  $values = @()
  foreach ($name in $Names) {
    $value = $Obj.$name
    if ($null -eq $value) { continue }
    foreach ($item in @($value)) {
      if (![string]::IsNullOrWhiteSpace([string]$item)) { $values += [string]$item }
    }
  }
  return @($values)
}

function Get-MaterializeScalar($Obj, [string[]]$Names, [string]$Default = "") {
  foreach ($name in $Names) {
    if (![string]::IsNullOrWhiteSpace([string]$Obj.$name)) { return [string]$Obj.$name }
  }
  return $Default
}

function Get-MaterializeType([string]$Type, [string]$Target) {
  $normalized = $Type.ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($normalized)) { $normalized = "functional" }
  if ($Target -match "(?i)^/?api/|^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/api/") { return "api" }
  if ($Target -match "(?i)\.(png|jpg|jpeg|webp|gif)$|visual|screenshot|docs[/\\].*ui") { return "visual" }
  if ($Target -match "^/") { return "route" }
  if ($normalized -in @("route","api","e2e","visual","contract","unit","state","content")) { return $normalized }
  return "content"
}

function Add-MaterializationGap($Id, $Severity, $Description, $RepairTarget, $Source) {
  $script:gaps += [PSCustomObject]@{
    id = $Id
    severity = $Severity
    description = $Description
    repairTarget = $RepairTarget
    source = $Source
  }
  if ($Severity -in @("HARD_FAIL","IN_SCOPE_GAP","PRODUCT_DECISION_REQUIRED")) {
    Add-Gap $ProjectRoot $round $Id "story-test-materialization" $Severity $Description $RepairTarget $Source
  }
}

$routeGenerated = Join-Path $p.Generated "route-smoke.generated.mjs"
$apiGenerated = Join-Path $p.Generated "api-smoke.generated.mjs"
$e2eGenerated = Join-Path $p.Generated "e2e-flow.generated.spec.ts"
$visualTargetsGenerated = Join-Path $p.Generated "visual-targets.generated.json"
$routeEvidence = "docs/auto-execute/results/route-smoke.generated.json"
$apiEvidence = "docs/auto-execute/results/api-smoke.generated.json"
$e2eEvidence = "docs/auto-execute/results/e2e-flow.generated.json"
$visualEvidence = "docs/auto-execute/results/ui-verifier.json"
$contractEvidence = "docs/auto-execute/results/contract-verifier.json"
$routeCommand = "node scripts/acceptance/generated/route-smoke.generated.mjs --project-root ."
$apiCommand = "node scripts/acceptance/generated/api-smoke.generated.mjs --project-root ."
$e2eCommand = "npx playwright test scripts/acceptance/generated/e2e-flow.generated.spec.ts"
$visualCommand = "powershell -ExecutionPolicy Bypass -File scripts/acceptance/run-ui-capture.ps1; powershell -ExecutionPolicy Bypass -File scripts/acceptance/run-ui-compare.ps1"
$contractCommand = "powershell -ExecutionPolicy Bypass -File scripts/acceptance/run-contract-verify.ps1"

try { $target = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $target = $null }
try { $matrix = Get-Content -LiteralPath $p.StoryTestMatrix -Raw | ConvertFrom-Json } catch { $matrix = $null }
try { $uiTarget = Get-Content -LiteralPath $p.UiTarget -Raw | ConvertFrom-Json } catch { $uiTarget = $null }
try { $contractMap = Get-Content -LiteralPath $p.ContractMapJson -Raw | ConvertFrom-Json } catch { $contractMap = $null }

$stories = if ($null -ne $target -and $null -ne $target.stories) { @($target.stories) } else { @() }
$matrixPoints = if ($null -ne $matrix -and $null -ne $matrix.testPoints) { @($matrix.testPoints) } else { @() }
$gaps = @()
$materializedStories = @()
$updatedStories = @()
$routeTargets = @()
$apiTargets = @()
$visualTargets = @()
$e2eTargets = @()

foreach ($story in $stories) {
  $storyId = Get-MaterializeScalar $story @("storyId","id") "STORY-UNKNOWN"
  $priority = Get-MaterializeScalar $story @("priority") "P1"
  $source = Get-MaterializeScalar $story @("source") (Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget)
  $storyPoints = @($story.testPoints) | Where-Object { $null -ne $_ }
  if ($storyPoints.Count -eq 0) {
    $storyPoints = @($matrixPoints | Where-Object { $_.storyId -eq $storyId })
  }
  $materializedPoints = @()
  foreach ($tp in $storyPoints) {
    $tpId = Get-MaterializeScalar $tp @("testPointId","id") "TP-$storyId-UNKNOWN"
    $targetText = Get-MaterializeScalar $tp @("target","route","api","path","screen") ""
    $type = Get-MaterializeType (Get-MaterializeScalar $tp @("type","kind") "") $targetText
    $existingCommand = Get-MaterializeScalar $tp @("command","testCommand") ""
    $existingEvidence = Get-MaterializeScalar $tp @("evidenceOutput","result","resultPath") ""
    $status = "MANUAL_REVIEW_REQUIRED"
    $generatedTest = ""
    $command = $existingCommand
    $evidenceOutput = $existingEvidence
    $reason = ""

    switch ($type) {
      "route" {
        $status = "GENERATED"
        $generatedTest = Get-RelativeEvidencePath $ProjectRoot $routeGenerated
        $command = $routeCommand
        $evidenceOutput = $routeEvidence
        $routeTargets += [PSCustomObject]@{ storyId=$storyId; testPointId=$tpId; target=$targetText; expected=$tp.expected }
      }
      "api" {
        $status = "GENERATED"
        $generatedTest = Get-RelativeEvidencePath $ProjectRoot $apiGenerated
        $command = $apiCommand
        $evidenceOutput = $apiEvidence
        $apiTargets += [PSCustomObject]@{ storyId=$storyId; testPointId=$tpId; target=$targetText; expected=$tp.expected }
      }
      "e2e" {
        $configured = Get-HarnessConfigValue $ProjectRoot "commands" "e2e" ""
        if (![string]::IsNullOrWhiteSpace($configured)) {
          $status = "BOUND"
          $generatedTest = "harness.yml:commands.e2e"
          $command = $configured
        } else {
          $status = "GENERATED"
          $generatedTest = Get-RelativeEvidencePath $ProjectRoot $e2eGenerated
          $command = $e2eCommand
        }
        $evidenceOutput = $e2eEvidence
        $e2eTargets += [PSCustomObject]@{ storyId=$storyId; testPointId=$tpId; target=$targetText; expected=$tp.expected }
      }
      "visual" {
        $status = "BOUND_TO_UI_VERIFIER"
        $generatedTest = "scripts/acceptance/run-ui-capture.ps1 + scripts/acceptance/run-ui-compare.ps1"
        $command = $visualCommand
        $evidenceOutput = $visualEvidence
        $visualTargets += [PSCustomObject]@{ storyId=$storyId; testPointId=$tpId; target=$targetText; expected=$tp.expected }
      }
      "contract" {
        $status = "BOUND"
        $generatedTest = Get-RelativeEvidencePath $ProjectRoot $p.ContractMapJson
        $command = $contractCommand
        $evidenceOutput = $contractEvidence
      }
      "unit" {
        $testCommand = Get-HarnessConfigValue $ProjectRoot "commands" "test" ""
        if (![string]::IsNullOrWhiteSpace($testCommand)) {
          $status = "BOUND"
          $generatedTest = "harness.yml:commands.test"
          $command = $testCommand
          $evidenceOutput = "docs/auto-execute/results/frontend-test.json"
        } else {
          $status = "MANUAL_REVIEW_REQUIRED"
          $reason = "No unit test command is configured in harness.yml."
        }
      }
      "state" {
        $status = "GENERATED"
        $generatedTest = Get-RelativeEvidencePath $ProjectRoot $e2eGenerated
        $command = $e2eCommand
        $evidenceOutput = $e2eEvidence
        $e2eTargets += [PSCustomObject]@{ storyId=$storyId; testPointId=$tpId; target=$targetText; expected=$tp.expected }
      }
      "content" {
        if ($targetText -match "^/") {
          $status = "GENERATED"
          $generatedTest = Get-RelativeEvidencePath $ProjectRoot $routeGenerated
          $command = $routeCommand
          $evidenceOutput = $routeEvidence
          $routeTargets += [PSCustomObject]@{ storyId=$storyId; testPointId=$tpId; target=$targetText; expected=$tp.expected }
        } else {
          $status = "MANUAL_REVIEW_REQUIRED"
          $reason = "Content test point has no route/API target to bind automatically."
        }
      }
      default {
        $status = "MANUAL_REVIEW_REQUIRED"
        $reason = "Unknown test point type '$type'."
      }
    }

    if (![string]::IsNullOrWhiteSpace($existingCommand) -and ![string]::IsNullOrWhiteSpace($existingEvidence)) {
      $status = "BOUND"
      $command = $existingCommand
      $evidenceOutput = $existingEvidence
      if ([string]::IsNullOrWhiteSpace($generatedTest)) { $generatedTest = "existing test binding" }
    }

    if ($priority -in @("P0","P1") -and $status -notin @("GENERATED","BOUND","BOUND_TO_UI_VERIFIER","MANUAL_REVIEW_REQUIRED","DEFERRED")) {
      Add-MaterializationGap "GAP-$tpId-MATERIALIZATION" "HARD_FAIL" "P0/P1 story test point $tpId is not materialized." "Generate or bind an executable test command and evidence output." $source
    }
    if ($priority -in @("P0","P1") -and $status -in @("GENERATED","BOUND","BOUND_TO_UI_VERIFIER") -and ([string]::IsNullOrWhiteSpace($command) -or [string]::IsNullOrWhiteSpace($evidenceOutput))) {
      Add-MaterializationGap "GAP-$tpId-MATERIALIZATION-BINDING" "HARD_FAIL" "P0/P1 story test point $tpId lacks command or evidence output binding." "Attach command and evidenceOutput for $tpId." $source
      $status = "HARD_FAIL"
    }
    if ($priority -in @("P0","P1") -and $status -eq "MANUAL_REVIEW_REQUIRED") {
      Add-MaterializationGap "GAP-$tpId-MANUAL-MATERIALIZATION" "MANUAL_REVIEW_REQUIRED" "Test point $tpId could not be automated: $reason" "Bind an existing test or record manual review evidence." $source
    }

    $materialized = [PSCustomObject]@{
      testPointId = $tpId
      type = $type
      target = $targetText
      materializationStatus = $status
      generatedTest = $generatedTest
      command = $command
      evidenceOutput = $evidenceOutput
      reason = $reason
    }
    $materializedPoints += $materialized
    $tp | Add-Member -NotePropertyName materializationStatus -NotePropertyValue $status -Force
    $tp | Add-Member -NotePropertyName command -NotePropertyValue $command -Force
    $tp | Add-Member -NotePropertyName evidenceOutput -NotePropertyValue $evidenceOutput -Force
  }
  $story | Add-Member -NotePropertyName testPoints -NotePropertyValue $storyPoints -Force
  $updatedStories += $story
  $materializedStories += [PSCustomObject]@{
    storyId = $storyId
    priority = $priority
    testPoints = $materializedPoints
  }
}

$routeScript = @'
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
};
const projectRoot = path.resolve(argValue("project-root", "."));
const baseArg = argValue("base-url", process.env.AUTO_EXECUTE_UI_BASE_URL || "http://127.0.0.1:3000");
const materializedPath = path.join(projectRoot, "docs", "auto-execute", "story-materialized-tests.json");
const outPath = path.join(projectRoot, "docs", "auto-execute", "results", "route-smoke.generated.json");
const materialized = JSON.parse(fs.readFileSync(materializedPath, "utf8").replace(/^\uFEFF/, ""));
const points = materialized.stories.flatMap((story) => (story.testPoints || []).map((tp) => ({ storyId: story.storyId, ...tp }))).filter((tp) => tp.type === "route" || (tp.type === "content" && String(tp.target || "").startsWith("/")));
function requestStatus(url, method = "GET") {
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.request(url, { method, timeout: 10000 }, (response) => {
      response.resume();
      response.on("end", () => resolve({ statusCode: response.statusCode, pass: response.statusCode < 500 }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", (error) => resolve({ pass: false, error: error.message }));
    req.end();
  });
}
const results = [];
for (const tp of points) {
  const target = String(tp.target || "");
  const url = target.startsWith("http") ? target : new URL(target || "/", baseArg).toString();
  const result = await requestStatus(url, "GET");
  results.push({ storyId: tp.storyId, testPointId: tp.testPointId, target, url, ...result });
}
const pass = results.length > 0 && results.every((r) => r.pass);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.9.1", lane: "route-smoke-generated", status: pass ? "PASS" : "HARD_FAIL", generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(pass ? 0 : 1);
'@
$routeScript | Set-Content -Encoding UTF8 $routeGenerated

$apiScript = @'
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
const args = process.argv.slice(2);
const argValue = (name, fallback = "") => {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
};
const projectRoot = path.resolve(argValue("project-root", "."));
const baseArg = argValue("base-url", process.env.AUTO_EXECUTE_API_BASE_URL || process.env.AUTO_EXECUTE_UI_BASE_URL || "http://127.0.0.1:3000");
const materializedPath = path.join(projectRoot, "docs", "auto-execute", "story-materialized-tests.json");
const outPath = path.join(projectRoot, "docs", "auto-execute", "results", "api-smoke.generated.json");
const materialized = JSON.parse(fs.readFileSync(materializedPath, "utf8").replace(/^\uFEFF/, ""));
const apiPoints = materialized.stories.flatMap((story) => (story.testPoints || []).map((tp) => ({ storyId: story.storyId, ...tp }))).filter((tp) => tp.type === "api");
function requestStatus(url, method = "GET") {
  return new Promise((resolve) => {
    const client = url.startsWith("https:") ? https : http;
    const req = client.request(url, { method, timeout: 10000 }, (response) => {
      response.resume();
      response.on("end", () => resolve({ statusCode: response.statusCode, pass: response.statusCode < 500 }));
    });
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    req.on("error", (error) => resolve({ pass: false, error: error.message }));
    req.end();
  });
}
const results = [];
for (const tp of apiPoints) {
  const raw = String(tp.target || "");
  const match = raw.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i);
  const method = match ? match[1].toUpperCase() : "GET";
  const route = match ? match[2] : raw;
  const url = route.startsWith("http") ? route : new URL(route || "/", baseArg).toString();
  const result = await requestStatus(url, method);
  results.push({ storyId: tp.storyId, testPointId: tp.testPointId, target: raw, method, url, ...result });
}
const pass = results.length > 0 && results.every((r) => r.pass);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.9.1", lane: "api-smoke-generated", status: pass ? "PASS" : "HARD_FAIL", generatedAt: new Date().toISOString(), results }, null, 2));
process.exit(pass ? 0 : 1);
'@
$apiScript | Set-Content -Encoding UTF8 $apiGenerated

$e2eScript = @'
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const projectRoot = process.env.AUTO_EXECUTE_PROJECT_ROOT || process.cwd();
const baseURL = process.env.AUTO_EXECUTE_UI_BASE_URL || "http://127.0.0.1:3000";
const materializedPath = path.join(projectRoot, "docs", "auto-execute", "story-materialized-tests.json");
const outPath = path.join(projectRoot, "docs", "auto-execute", "results", "e2e-flow.generated.json");
const materialized = JSON.parse(fs.readFileSync(materializedPath, "utf8").replace(/^\uFEFF/, ""));
const points = materialized.stories.flatMap((story) => (story.testPoints || []).map((tp) => ({ storyId: story.storyId, ...tp }))).filter((tp) => ["e2e", "state"].includes(tp.type));
test.afterAll(async () => {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ schemaVersion: "1.9.1", lane: "e2e-flow-generated", status: "PASS", generatedAt: new Date().toISOString(), count: points.length }, null, 2));
});
for (const tp of points) {
  test(`${tp.storyId} ${tp.testPointId} ${tp.target || "flow"}`, async ({ page }) => {
    const target = String(tp.target || "/");
    if (target.startsWith("/")) {
      await page.goto(new URL(target, baseURL).toString());
      await expect(page.locator("body")).toBeVisible();
    } else {
      test.info().annotations.push({ type: "manual-target", description: target });
    }
  });
}
'@
$e2eScript | Set-Content -Encoding UTF8 $e2eGenerated

@{
  schemaVersion = $AE_SCHEMA_VERSION
  generatedAt = (Get-Date).ToString("s")
  visualTargets = $visualTargets
  uiTarget = if ($null -ne $uiTarget) { Get-RelativeEvidencePath $ProjectRoot $p.UiTarget } else { "" }
} | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $visualTargetsGenerated

if ($updatedStories.Count -gt 0) {
  $target | Add-Member -NotePropertyName stories -NotePropertyValue $updatedStories -Force
  $target | Add-Member -NotePropertyName generatedAt -NotePropertyValue (Get-Date).ToString("s") -Force
  $target | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $p.StoryTarget
}

$hard = @($gaps | Where-Object { $_.severity -eq "HARD_FAIL" })
$manual = @($gaps | Where-Object { $_.severity -eq "MANUAL_REVIEW_REQUIRED" })
$statusOut = if ($hard.Count -gt 0) { "HARD_FAIL" } elseif ($manual.Count -gt 0) { "PASS_WITH_LIMITATION" } elseif ($materializedStories.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "MANUAL_REVIEW_REQUIRED" }
@{
  schemaVersion = $AE_SCHEMA_VERSION
  generatedAt = (Get-Date).ToString("s")
  status = $statusOut
  stories = $materializedStories
  generated = @{
    routeSmoke = Get-RelativeEvidencePath $ProjectRoot $routeGenerated
    apiSmoke = Get-RelativeEvidencePath $ProjectRoot $apiGenerated
    e2eFlow = Get-RelativeEvidencePath $ProjectRoot $e2eGenerated
    visualTargets = Get-RelativeEvidencePath $ProjectRoot $visualTargetsGenerated
  }
  sourceMaps = @{
    storyTarget = Get-RelativeEvidencePath $ProjectRoot $p.StoryTarget
    storyTestMatrix = Get-RelativeEvidencePath $ProjectRoot $p.StoryTestMatrix
    uiTarget = if ($null -ne $uiTarget) { Get-RelativeEvidencePath $ProjectRoot $p.UiTarget } else { "" }
    contractMap = if ($null -ne $contractMap) { Get-RelativeEvidencePath $ProjectRoot $p.ContractMapJson } else { "" }
  }
} | ConvertTo-Json -Depth 50 | Set-Content -Encoding UTF8 $p.StoryMaterializedTests

@{
  schemaVersion = $AE_SCHEMA_VERSION
  generatedAt = (Get-Date).ToString("s")
  lane = "story-test-materialize"
  status = $statusOut
  gaps = $gaps
} | ConvertTo-Json -Depth 30 | Set-Content -Encoding UTF8 $p.StoryGapList

Write-LaneResult $ProjectRoot "story-test-materialize" $statusOut @() @(
  (Get-RelativeEvidencePath $ProjectRoot $p.StoryMaterializedTests),
  (Get-RelativeEvidencePath $ProjectRoot $routeGenerated),
  (Get-RelativeEvidencePath $ProjectRoot $apiGenerated),
  (Get-RelativeEvidencePath $ProjectRoot $e2eGenerated),
  (Get-RelativeEvidencePath $ProjectRoot $visualTargetsGenerated),
  (Get-RelativeEvidencePath $ProjectRoot $p.StoryGapList)
) $gaps @("Run generated or bound commands to produce evidence, then rerun story quality/final gate.")
Add-VerificationResult $ProjectRoot "story-test-materialize" $statusOut "Materialized $($materializedStories.Count) story item(s); hard gaps: $($hard.Count); manual review: $($manual.Count)" $p.StoryMaterializedTests
Write-Host "[$statusOut] story-test-materialize: $($materializedStories.Count) story item(s), $($hard.Count) hard gap(s), $($manual.Count) manual item(s)"
