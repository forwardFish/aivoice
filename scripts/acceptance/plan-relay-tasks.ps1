param(
  [string]$ProjectRoot = (Get-Location).Path,
  [Parameter(Mandatory=$true)][string]$Goal,
  [int]$MaxTasks = 6,
  [string]$TodoPath = "TODO.md",
  [switch]$ResetRelay
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

function Write-RelayLog {
  param([string]$Message)
  $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$time] $Message"
}

function Get-JsonObjectFromText {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { throw "Planner output is empty." }
  $candidate = $Text.Trim()
  if ($candidate -match '(?s)```(?:json)?\s*(.*?)\s*```') {
    $candidate = $Matches[1].Trim()
  }
  $start = $candidate.IndexOf("{")
  $end = $candidate.LastIndexOf("}")
  if ($start -lt 0 -or $end -lt $start) { throw "Planner output did not contain a JSON object." }
  return $candidate.Substring($start, $end - $start + 1)
}

function ConvertTo-SafeTodoText {
  param([string]$Text)
  if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
  return (($Text -replace "`r", " ") -replace "`n", " ").Trim()
}

$ProjectRoot = Get-ProjectRoot $ProjectRoot
Set-Location $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if (-not [System.IO.Path]::IsPathRooted($TodoPath)) {
  $TodoPath = Join-Path $ProjectRoot $TodoPath
}

if ((Test-Path -LiteralPath $TodoPath) -and -not $ResetRelay) {
  Write-RelayLog "TODO already exists and ResetRelay was not set: $TodoPath"
  exit 0
}

if (!(Test-CommandExists "codex")) {
  throw "codex CLI is not available on PATH."
}

$runDir = Join-Path $ProjectRoot ".codex-runs"
Ensure-Dir $runDir
$rawFile = Join-Path $runDir ("relay-planner-{0}.raw.txt" -f (Get-Date -Format "yyyyMMddHHmmss"))
$jsonFile = Join-Path $runDir "relay-tasks.json"
$latestDir = Join-Path $p.Docs "latest"
Ensure-Dir $latestDir
$latestRelayJson = Join-Path $latestDir "relay-tasks.json"

$plannerPrompt = @"
You are the auto-execute Relay Planner.

Goal:
$Goal

Project root:
$ProjectRoot

You must inspect the repository and split the goal into at most $MaxTasks small sequential tasks.

Rules:
1. Do not modify product code.
2. Do not run destructive commands.
3. Prefer tasks that each fit one fresh codex exec worker.
4. Order tasks as: audit/init -> runtime blockers -> core implementation -> integration -> tests -> final acceptance.
5. Every task must be independently executable by a new worker that only reads repository files, TODO.md, and docs/auto-execute/latest/HANDOFF.md.
6. Do not include codex exec commands in verificationCommands; the Relay supervisor already launches one fresh codex exec worker per task.
7. Return ONLY JSON. No markdown. No code fences.

JSON shape:
{
  "tasks": [
    {
      "id": "T01",
      "title": "short title",
      "summary": "what the worker must do",
      "allowedScope": "files or areas the worker may touch",
      "verificationCommands": ["command 1"],
      "doneWhen": ["clear acceptance condition 1"]
    }
  ]
}
"@

Write-RelayLog "Planning relay tasks with a read-only Codex planner."
$plannerPrompt | codex exec --cd $ProjectRoot --sandbox read-only --output-last-message $rawFile -

$raw = Get-Content -LiteralPath $rawFile -Raw
$jsonText = Get-JsonObjectFromText $raw
$jsonText | Set-Content -LiteralPath $jsonFile -Encoding UTF8
Copy-Item -LiteralPath $jsonFile -Destination $latestRelayJson -Force

try {
  $parsed = $jsonText | ConvertFrom-Json
} catch {
  throw "Failed to parse planner JSON: $($_.Exception.Message). Raw output: $rawFile"
}

if ($null -eq $parsed.tasks -or @($parsed.tasks).Count -eq 0) {
  throw "Planner returned no tasks."
}

$todoLines = New-Object System.Collections.Generic.List[string]
$todoLines.Add("# Auto Execute Relay TODO")
$todoLines.Add("")
$todoLines.Add("Generated: $(Get-Date)")
$todoLines.Add("")
$todoLines.Add("## Goal")
$todoLines.Add("")
$todoLines.Add($Goal)
$todoLines.Add("")
$todoLines.Add("## Tasks")
$todoLines.Add("")

$index = 0
foreach ($task in @($parsed.tasks)) {
  $index += 1
  $id = if ([string]::IsNullOrWhiteSpace([string]$task.id)) { "T{0:D2}" -f $index } else { ConvertTo-SafeTodoText ([string]$task.id) }
  $title = if ([string]::IsNullOrWhiteSpace([string]$task.title)) { "Relay task $index" } else { ConvertTo-SafeTodoText ([string]$task.title) }
  $summary = ConvertTo-SafeTodoText ([string]$task.summary)
  $scope = ConvertTo-SafeTodoText ([string]$task.allowedScope)

  $todoLines.Add("- [ ] ${id}: $title")
  if ($summary) { $todoLines.Add("  - Summary: $summary") }
  if ($scope) { $todoLines.Add("  - Allowed scope: $scope") }

  $commands = @($task.verificationCommands) | ForEach-Object { ConvertTo-SafeTodoText ([string]$_) } | Where-Object { $_ }
  if ($commands.Count -gt 0) {
    $todoLines.Add("  - Verification commands:")
    foreach ($cmd in $commands) { $todoLines.Add("    - $cmd") }
  }

  $done = @($task.doneWhen) | ForEach-Object { ConvertTo-SafeTodoText ([string]$_) } | Where-Object { $_ }
  if ($done.Count -gt 0) {
    $todoLines.Add("  - Done when:")
    foreach ($item in $done) { $todoLines.Add("    - $item") }
  }
  $todoLines.Add("")
}

$todoLines -join "`r`n" | Set-Content -LiteralPath $TodoPath -Encoding UTF8

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "relay-plan-created" -NextCommand "powershell -ExecutionPolicy Bypass -File .\scripts\acceptance\run-codex-relay.ps1 -ProjectRoot `"$ProjectRoot`""

Add-VerificationResult $ProjectRoot "relay-planner" "PASS" "Generated $(@($parsed.tasks).Count) relay tasks" $TodoPath
Write-RelayLog "Relay TODO generated: $TodoPath"
