param(
  [string]$ProjectRoot = (Get-Location).Path,
  [string]$Goal = "",
  [int]$MaxTasks = 6,
  [int]$MaxWorkerRounds = 12,
  [ValidateSet("fast","gate","full")] [string]$Mode = "gate",
  [string]$TodoPath = "TODO.md",
  [switch]$ResetRelay,
  [switch]$NewWindow
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

function Write-RelayLog {
  param([string]$Message)
  $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$time] $Message"
}

$ProjectRoot = Get-ProjectRoot $ProjectRoot
Set-Location $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if (-not [System.IO.Path]::IsPathRooted($TodoPath)) {
  $TodoPath = Join-Path $ProjectRoot $TodoPath
}

if (!(Test-Path -LiteralPath (Join-Path $p.Docs "latest\HANDOFF.md"))) {
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "relay-start"
}

$todoExists = Test-Path -LiteralPath $TodoPath
if ($ResetRelay -or -not $todoExists) {
  if ([string]::IsNullOrWhiteSpace($Goal)) {
    throw "Goal is required when ResetRelay is set or TODO.md does not exist."
  }

  Write-RelayLog "Creating relay TODO from goal."
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "plan-relay-tasks.ps1") `
    -ProjectRoot $ProjectRoot `
    -Goal $Goal `
    -MaxTasks $MaxTasks `
    -TodoPath $TodoPath `
    -ResetRelay
} else {
  Write-RelayLog "Using existing TODO queue: $TodoPath"
}

$supervisorArgs = @(
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $PSScriptRoot "run-codex-supervisor.ps1"),
  "-ProjectRoot", $ProjectRoot,
  "-MaxWorkerRounds", $MaxWorkerRounds,
  "-Mode", $Mode,
  "-TodoPath", $TodoPath
)
if ($NewWindow) { $supervisorArgs += "-NewWindow" }

Write-RelayLog "Starting relay supervisor. One fresh Codex worker per TODO item."
& powershell @supervisorArgs
$exitCode = $LASTEXITCODE

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "relay-finished"

Write-RelayLog "Relay finished with exit code $exitCode."
exit $exitCode
