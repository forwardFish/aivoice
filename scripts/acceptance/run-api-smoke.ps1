param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast", [string]$BaseUrl = "http://127.0.0.1:3000")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$out = Join-Path $p.Summaries "api-smoke.md"
"# API Smoke`nBase URL: $BaseUrl`n" | Set-Content -Encoding UTF8 $out
$surface = Join-Path $p.Docs "03-surface-map.md"
$endpoints = @()
if (Test-Path $surface) {
  $content = Get-Content $surface -Raw
  $matches = [regex]::Matches($content, '(GET|POST|PUT|PATCH|DELETE)\s+(/[A-Za-z0-9_.\/{}:-]+)')
  foreach ($m in $matches) { $endpoints += @{ method=$m.Groups[1].Value; path=$m.Groups[2].Value } }
}
if ($endpoints.Count -eq 0) {
  Add-Blocker $ProjectRoot "api-smoke" "MANUAL_REVIEW_REQUIRED" "No endpoints found in surface map"
  Write-LaneResult $ProjectRoot "api-smoke" "MANUAL_REVIEW_REQUIRED" @() @((Get-RelativeEvidencePath $ProjectRoot $out)) @("No endpoints found in surface map") @("Populate 03-surface-map.md or 04-contract-map.md with API endpoints.")
  Write-Host "[MANUAL_REVIEW_REQUIRED] api-smoke"
  exit 0
}
$commands = @()
$hardFail = $false
foreach ($ep in $endpoints) {
  $url = $BaseUrl.TrimEnd("/") + $ep.path
  try {
    $start = Get-Date
    $resp = Invoke-WebRequest -Uri $url -Method $ep.method -UseBasicParsing -TimeoutSec 20
    $ms = ((Get-Date) - $start).TotalMilliseconds
    Add-Content -Encoding UTF8 $out "- $($ep.method) $url -> $($resp.StatusCode), $ms ms"
    Add-VerificationResult $ProjectRoot "api:$($ep.method) $($ep.path)" "PASS" "Status $($resp.StatusCode)" $out
    $commands += @{ command = "$($ep.method) $url"; status = "PASS"; log = Get-RelativeEvidencePath $ProjectRoot $out }
  } catch {
    Add-Content -Encoding UTF8 $out "ERROR: $($ep.method) $url failed: $($_.Exception.Message)"
    Add-VerificationResult $ProjectRoot "api:$($ep.method) $($ep.path)" "HARD_FAIL" $_.Exception.Message $out
    $commands += @{ command = "$($ep.method) $url"; status = "HARD_FAIL"; log = Get-RelativeEvidencePath $ProjectRoot $out }
    $hardFail = $true
  }
}
Write-LaneResult $ProjectRoot "api-smoke" $(if ($hardFail) { "HARD_FAIL" } else { "PASS" }) $commands @((Get-RelativeEvidencePath $ProjectRoot $out)) $(if ($hardFail) { @("One or more API smoke requests failed") } else { @() }) @()
