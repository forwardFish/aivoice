param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

try { $map = Get-Content -LiteralPath $p.ContractMapJson -Raw | ConvertFrom-Json } catch { $map = $null }
$gaps = @()
$limitations = @()
function Add-ContractGap($Id, $Severity, $Description, $RepairTarget) {
  $script:gaps += [PSCustomObject]@{ id=$Id; severity=$Severity; description=$Description; repairTarget=$RepairTarget }
  Add-Gap $ProjectRoot $round $Id "contract" $Severity $Description $RepairTarget (Get-RelativeEvidencePath $ProjectRoot $p.ContractMapJson)
}
function Get-ContractValue($Contract, [string[]]$Names) {
  foreach ($name in $Names) {
    if (![string]::IsNullOrWhiteSpace([string]$Contract.$name)) { return [string]$Contract.$name }
  }
  return ""
}
function Split-ContractMethodPath([string]$Text, [string]$FallbackMethod = "") {
  $value = ([string]$Text).Trim()
  $method = ([string]$FallbackMethod).Trim().ToUpperInvariant()
  $path = $value
  $mp = [regex]::Match($value, '^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($mp.Success) {
    $method = $mp.Groups[1].Value.ToUpperInvariant()
    $path = $mp.Groups[2].Value.Trim()
  }
  return [PSCustomObject]@{ method=$method; path=$path }
}
function Normalize-ContractPath([string]$Path) {
  $value = ([string]$Path).Trim().Trim('"').Trim("'")
  if ([string]::IsNullOrWhiteSpace($value)) { return "" }
  try {
    $uri = [System.Uri]$value
    if ($uri.IsAbsoluteUri) { $value = $uri.AbsolutePath }
  } catch {}
  $value = $value -replace '[?#].*$',''
  $value = $value -replace '\\','/'
  $value = $value -replace '\[([^\]]+)\]','{}'
  $value = $value -replace '\{[^/]+\}','{}'
  $value = $value -replace ':[^/]+','{}'
  if ($value -notmatch '^/') { $value = "/" + $value }
  $value = $value -replace '/+','/'
  if ($value.Length -gt 1) { $value = $value.TrimEnd('/') }
  return $value.ToLowerInvariant()
}
function Get-FrontendCallMethod($Call) {
  if (![string]::IsNullOrWhiteSpace([string]$Call.method)) { return ([string]$Call.method).ToUpperInvariant() }
  if (![string]::IsNullOrWhiteSpace([string]$Call.httpMethod)) { return ([string]$Call.httpMethod).ToUpperInvariant() }
  $text = [string]$Call.call
  $m = [regex]::Match($text, '(?i)(axios|http|dio)\.(get|post|put|patch|delete)\b')
  if ($m.Success) { return $m.Groups[2].Value.ToUpperInvariant() }
  $m = [regex]::Match($text, '(?i)\bmethod\s*:\s*["'']?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)')
  if ($m.Success) { return $m.Groups[1].Value.ToUpperInvariant() }
  return ""
}
function Get-FrontendCallPath($Call) {
  foreach ($name in @("path","url","endpoint","frontendRequest","request")) {
    if (![string]::IsNullOrWhiteSpace([string]$Call.$name)) {
      $split = Split-ContractMethodPath ([string]$Call.$name) (Get-FrontendCallMethod $Call)
      return $split
    }
  }
  return [PSCustomObject]@{ method=(Get-FrontendCallMethod $Call); path="" }
}
function Test-ContractMethodMatches([string]$FrontendMethod, [string]$BackendMethod) {
  if ([string]::IsNullOrWhiteSpace($FrontendMethod) -or [string]::IsNullOrWhiteSpace($BackendMethod)) { return $true }
  if ($BackendMethod -eq "UNKNOWN" -or $FrontendMethod -eq "UNKNOWN") { return $true }
  return $FrontendMethod.ToUpperInvariant() -eq $BackendMethod.ToUpperInvariant()
}

if ($null -eq $map) {
  Add-ContractGap "GAP-CONTRACT-MAP-MISSING" "HARD_FAIL" "contract-map.json is missing or invalid." "Run run-contract-map.ps1 and reconcile contract-map.json."
} else {
  $frontendCalls = @($map.frontendCalls)
  $apiDefs = @($map.apiDefinitions)
  $contracts = @($map.contracts)
  $apiRoutes = @()
  foreach ($api in $apiDefs) {
    $apiSplit = Split-ContractMethodPath ([string](Get-ContractValue $api @("frontendRequest","endpoint","path","route"))) ([string](Get-ContractValue $api @("method","httpMethod")))
    $apiPath = Normalize-ContractPath $apiSplit.path
    if (![string]::IsNullOrWhiteSpace($apiPath)) {
      $apiRoutes += [PSCustomObject]@{ method=$apiSplit.method; path=$apiPath; file=$api.file; source=$api.source }
    }
  }
  if ($frontendCalls.Count -gt 0 -and $contracts.Count -eq 0) {
    Add-ContractGap "GAP-CONTRACT-NOT-RECONCILED" "IN_SCOPE_GAP" "Frontend API/data calls were discovered but no reconciled contracts are recorded." "Record frontend caller, backend endpoint, method, request body, response shape, auth/session, error/loading/empty states, and evidence in contract-map.json."
  }
  if ($frontendCalls.Count -gt 0 -and $apiDefs.Count -eq 0 -and $contracts.Count -eq 0) {
    Add-ContractGap "GAP-CONTRACT-API-MISSING" "HARD_FAIL" "Frontend calls exist but no backend API definitions were auto-detected and no contract evidence was provided." "Implement or map the backend API endpoints expected by the frontend."
  }
  if ($frontendCalls.Count -gt 0 -and $apiRoutes.Count -gt 0) {
    $seenCalls = @{}
    foreach ($call in $frontendCalls) {
      $callSplit = Get-FrontendCallPath $call
      $callPath = Normalize-ContractPath $callSplit.path
      if ([string]::IsNullOrWhiteSpace($callPath) -or $callPath -notmatch '^/api(/|$)') { continue }
      $callMethod = $callSplit.method
      $key = "$callMethod $callPath $($call.file)"
      if ($seenCalls.ContainsKey($key)) { continue }
      $seenCalls[$key] = $true
      $pathMatches = @($apiRoutes | Where-Object { $_.path -eq $callPath })
      if ($pathMatches.Count -eq 0) {
        Add-ContractGap "GAP-CONTRACT-FRONTEND-API-MISSING-$($seenCalls.Count)" "HARD_FAIL" "Frontend calls $callMethod $callPath but no matching backend route was discovered." "Implement the backend route or update the frontend call path. Caller: $($call.file)"
      } elseif (@($pathMatches | Where-Object { Test-ContractMethodMatches $callMethod $_.method }).Count -eq 0) {
        Add-ContractGap "GAP-CONTRACT-FRONTEND-METHOD-MISMATCH-$($seenCalls.Count)" "HARD_FAIL" "Frontend calls $callMethod $callPath but discovered backend method(s) are $((@($pathMatches | ForEach-Object { $_.method }) | Sort-Object -Unique) -join ', ')." "Align the frontend HTTP method with the backend route or implement the expected method. Caller: $($call.file)"
      }
    }
  }
  foreach ($contract in $contracts) {
    $id = if ([string]::IsNullOrWhiteSpace([string]$contract.id)) { "CONTRACT-UNKNOWN" } else { [string]$contract.id }
    $status = [string]$contract.status
    $required = !($contract.required -eq $false -or $status -in @("DEFERRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT"))
    $requiredFields = @(
      @{ label="frontendCaller"; aliases=@("frontendCaller","file","component","caller") },
      @{ label="endpoint"; aliases=@("endpoint","backendRoute","path","frontendRequest") },
      @{ label="method"; aliases=@("method","httpMethod") },
      @{ label="request"; aliases=@("request","requestShape","frontendRequest","body","payload") },
      @{ label="response"; aliases=@("response","responseShape","resultShape") },
      @{ label="auth"; aliases=@("auth","authSession","session") },
      @{ label="errorShape"; aliases=@("errorShape","error","errorState") },
      @{ label="evidence"; aliases=@("evidence","testEvidence","smokeEvidence") }
    )
    foreach ($field in $requiredFields) {
      if ($required -and [string]::IsNullOrWhiteSpace((Get-ContractValue $contract $field.aliases))) {
        Add-ContractGap "GAP-$id-$($field.label)" "IN_SCOPE_GAP" "Contract $id is missing $($field.label)." "Fill $($field.label) for contract $id with source and evidence."
      }
    }
    if ($required -and $status -notin @("PASS","PASS_WITH_LIMITATION")) {
      Add-ContractGap "GAP-$id-STATUS" "IN_SCOPE_GAP" "Contract $id status is $status, not PASS/PASS_WITH_LIMITATION." "Align frontend/backend path, method, payload, response, auth, error, and states for $id."
    }
    if ($status -in @("PASS_WITH_LIMITATION","MANUAL_REVIEW_REQUIRED","DOCUMENTED_BLOCKER","BLOCKED_BY_ENVIRONMENT","PRODUCT_DECISION_REQUIRED","DEFERRED")) {
      $limitations += [PSCustomObject]@{ id=$id; status=$status }
    }
  }
  if ($frontendCalls.Count -eq 0 -and $apiDefs.Count -eq 0 -and $contracts.Count -eq 0) {
    $limitations += [PSCustomObject]@{ id="CONTRACT-NONE"; status="DEFERRED"; note="No contract surface discovered." }
  }
}

$statusOut = if ($gaps.Count -gt 0) { "HARD_FAIL" } elseif ($limitations.Count -gt 0) { "PASS_WITH_LIMITATION" } else { "PASS" }
Write-LaneResult $ProjectRoot "contract-verifier" $statusOut @() @((Get-RelativeEvidencePath $ProjectRoot $p.ContractMapJson),(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)) $gaps @("Repair contract gaps and rerun run-contract-verify.ps1.")
Add-VerificationResult $ProjectRoot "contract-verifier" $statusOut "$($gaps.Count) contract gap(s), $($limitations.Count) limitation(s)" $p.ContractMapJson
Write-Host "[$statusOut] contract-verifier: $($gaps.Count) gap(s), $($limitations.Count) limitation(s)"
