param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot

if (-not (Get-HarnessLaneEnabled $ProjectRoot "contract" $true)) {
  Write-LaneResult $ProjectRoot "contract" "DEFERRED" @() @() @("contract lane disabled in harness.yml") @()
  Write-Host "[DEFERRED] contract"
  exit 0
}

$p = Get-AEPaths $ProjectRoot
$contract = Join-Path $p.Docs "04-contract-map.md"
if (!(Test-Path -LiteralPath $contract)) {
  "# Contract Map`n`n| ID | Endpoint/service | Method | Frontend caller | Request body | Response shape | Auth/session | Error shape | Loading state | Empty state | Test evidence | Status |`n|---|---|---|---|---|---|---|---|---|---|---|---|`n" | Set-Content -Encoding UTF8 $contract
}

$frontendCalls = @()
$apiDefs = @()
$sourceRoots = @()
$rootSrc = Join-Path $ProjectRoot "src"
if (Test-Path -LiteralPath $rootSrc) { $sourceRoots += $rootSrc }
foreach ($container in @("apps", "packages")) {
  $containerRoot = Join-Path $ProjectRoot $container
  if (!(Test-Path -LiteralPath $containerRoot)) { continue }
  foreach ($project in Get-ChildItem -LiteralPath $containerRoot -Directory -ErrorAction SilentlyContinue) {
    $projectSrc = Join-Path $project.FullName "src"
    if (Test-Path -LiteralPath $projectSrc) { $sourceRoots += $projectSrc }
    if ($project.Name -eq "miniprogram") { $sourceRoots += $project.FullName }
  }
}
$files = @($sourceRoots | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx,*.dart,*.py -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\|\\.git\\|\\build\\|\\dist\\|\\.dart_tool\\" }
})
foreach ($file in $files) {
  try { $txt = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop } catch { continue }
  if ([string]::IsNullOrEmpty($txt)) { continue }
  $rel = Get-RelativeEvidencePath $ProjectRoot $file.FullName
  foreach ($m in [regex]::Matches($txt, '(fetch|axios\.[a-z]+|http\.(get|post|put|patch|delete))\s*\(?\s*["'']([^"'']+/[^"'']*)["'']')) {
    $callText = $m.Groups[0].Value
    $snippetLength = [Math]::Min(300, $txt.Length - $m.Index)
    $snippet = $txt.Substring($m.Index, $snippetLength)
    $method = ""
    $methodMatch = [regex]::Match($callText, '(?i)(axios|http)\.(get|post|put|patch|delete)\b')
    if ($methodMatch.Success) { $method = $methodMatch.Groups[2].Value.ToUpperInvariant() }
    else {
      $methodMatch = [regex]::Match($snippet, '(?i)\bmethod\s*:\s*["'']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)')
      if ($methodMatch.Success) { $method = $methodMatch.Groups[1].Value.ToUpperInvariant() }
    }
    $frontendCalls += @{ file = $rel; call = $callText; path = $m.Groups[3].Value; method = $method }
  }
  foreach ($m in [regex]::Matches($txt, '(?s)requestRaw(?:<[^>]+>)?\s*\(\s*\{(?<body>.{0,800}?)\}\s*\)')) {
    $body = $m.Groups['body'].Value
    $pathMatch = [regex]::Match($body, '(?s)\bpath\s*:\s*([`"''])(?<path>.*?)\1')
    if (!$pathMatch.Success) { continue }
    $methodMatch = [regex]::Match($body, '(?i)\bmethod\s*:\s*["'']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)')
    $method = if ($methodMatch.Success) { $methodMatch.Groups[1].Value.ToUpperInvariant() } else { "GET" }
    $frontendCalls += @{
      file = $rel
      call = "requestRaw"
      path = $pathMatch.Groups['path'].Value
      method = $method
      framework = "wechat-miniprogram"
    }
  }
  foreach ($m in [regex]::Matches($txt, '(Get|Post|Put|Patch|Delete)\(["'']([^"'']*)["'']\)|(router|app)\.(get|post|put|patch|delete)\(["'']([^"'']*)["'']')) {
    $method = if (![string]::IsNullOrWhiteSpace($m.Groups[1].Value)) { $m.Groups[1].Value.ToUpperInvariant() } else { $m.Groups[4].Value.ToUpperInvariant() }
    $routePath = if (![string]::IsNullOrWhiteSpace($m.Groups[2].Value)) { $m.Groups[2].Value } else { $m.Groups[5].Value }
    $apiDefs += @{ file = $rel; def = $m.Groups[0].Value; method = $method; path = $routePath }
  }
  foreach ($m in [regex]::Matches($txt, '@(app|router)\.(get|post|put|patch|delete|head|options)\(["'']([^"'']+)["'']')) {
    $apiDefs += @{ file = $rel; def = $m.Groups[0].Value; method = $m.Groups[2].Value.ToUpperInvariant(); path = $m.Groups[3].Value; framework = "fastapi" }
  }
}

foreach ($adapter in @("next-contract.ps1","nest-contract.ps1","flutter-contract.ps1")) {
  $adapterPath = Join-Path $PSScriptRoot "adapters\$adapter"
  if (!(Test-Path -LiteralPath $adapterPath)) { continue }
  try {
    $raw = & powershell -ExecutionPolicy Bypass -File $adapterPath -ProjectRoot $ProjectRoot | Out-String
    if (![string]::IsNullOrWhiteSpace($raw)) {
      $adapterResult = $raw | ConvertFrom-Json
      foreach ($call in @($adapterResult.frontendCalls)) {
        if ($null -ne $call) { $frontendCalls += $call }
      }
      foreach ($def in @($adapterResult.apiDefinitions)) {
        if ($null -ne $def) { $apiDefs += $def }
      }
    }
  } catch {
    Add-VerificationResult $ProjectRoot "contract-adapter:$adapter" "PASS_WITH_LIMITATION" $_.Exception.Message ""
  }
}

$out = Join-Path $p.Results "contract-discovery.json"
$contractJson = $p.ContractMapJson
$contractObj = @{
  schemaVersion = $AE_SCHEMA_VERSION
  frontendCalls = $frontendCalls
  apiDefinitions = $apiDefs
  contracts = @()
  generatedAt = (Get-Date).ToString("s")
  status = "DISCOVERED"
  note = "Auto-discovery only. Agent must reconcile request/response/auth/error/loading/empty states before final PASS."
}
$contractObj | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $out
$contractObj | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 $contractJson
Add-EvidenceItem $ProjectRoot "api" $out "contract discovery"
Add-EvidenceItem $ProjectRoot "api" $contractJson "contract map json"

if ($frontendCalls.Count -eq 0 -and $apiDefs.Count -eq 0) {
  Add-Blocker $ProjectRoot "contract" "MANUAL_REVIEW_REQUIRED" "No frontend calls or backend API definitions auto-detected"
  Write-LaneResult $ProjectRoot "contract" "MANUAL_REVIEW_REQUIRED" @() @((Get-RelativeEvidencePath $ProjectRoot $contract),(Get-RelativeEvidencePath $ProjectRoot $out),(Get-RelativeEvidencePath $ProjectRoot $contractJson)) @("No contracts auto-detected") @("Fill 04-contract-map.md manually or add tests that expose API contracts.")
  Write-Host "[MANUAL_REVIEW_REQUIRED] contract"
} else {
  Add-VerificationResult $ProjectRoot "contract" "PASS" "Contract discovery generated; agent must reconcile map with PRD/UI" $out
  Write-LaneResult $ProjectRoot "contract" "PASS_WITH_LIMITATION" @() @((Get-RelativeEvidencePath $ProjectRoot $contract),(Get-RelativeEvidencePath $ProjectRoot $out),(Get-RelativeEvidencePath $ProjectRoot $contractJson)) @("Contract discovery is not proof that request/response/auth/error states are aligned.") @("Run run-contract-verify.ps1 after completing contract-map.json or contract tests.")
  Write-Host "[PASS] contract discovery"
}
