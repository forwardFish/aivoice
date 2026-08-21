param(
  [string]$ProjectRoot = (Get-Location).Path,
  [int]$MaxWorkerRounds = 20,
  [ValidateSet("fast","gate","full")] [string]$Mode = "gate",
  [string]$TodoPath = "TODO.md",
  [switch]$NewWindow
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\lib.ps1"

function Write-SupervisorLog {
  param([string]$Message)
  $time = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Write-Host "[$time] $Message"
}

function Test-TodoCompleted {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) { return $false }
  $todo = Get-Content -LiteralPath $Path -Raw
  return -not ($todo -match '(?m)^-\s+\[ \]\s+')
}

function Test-TodoBlocked {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) { return $false }
  $todo = Get-Content -LiteralPath $Path -Raw
  return ($todo -match '(?m)^##\s+BLOCKED\b')
}

$ProjectRoot = Get-ProjectRoot $ProjectRoot
Set-Location $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot

if (-not [System.IO.Path]::IsPathRooted($TodoPath)) {
  $TodoPath = Join-Path $ProjectRoot $TodoPath
}

$runDir = Join-Path $ProjectRoot ".codex-runs"
Ensure-Dir $runDir

if (!(Test-Path -LiteralPath (Join-Path $p.Docs "latest\HANDOFF.md"))) {
  Write-SupervisorLog "HANDOFF.md missing. Writing handoff."
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "supervisor-start"
}

if (!(Test-Path -LiteralPath $TodoPath)) {
  Write-SupervisorLog "TODO.md missing. Exporting TODO from latest gaps."
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "export-todo-from-gaps.ps1") -ProjectRoot $ProjectRoot -TodoPath $TodoPath
}

$workerPromptPath = Join-Path $PSScriptRoot "worker-prompt.txt"
if (!(Test-Path -LiteralPath $workerPromptPath)) {
  throw "worker-prompt.txt missing."
}
$workerPrompt = Get-Content -LiteralPath $workerPromptPath -Raw

if (!(Test-CommandExists "codex")) {
  Add-Content -Encoding UTF8 -LiteralPath $TodoPath -Value "`r`n## BLOCKED`r`ncodex CLI is not available on PATH, so supervisor cannot launch workers.`r`n"
  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "supervisor-codex-missing"
  Write-Host "ERROR: codex CLI is not available on PATH."
  exit 4
}

for ($i = 1; $i -le $MaxWorkerRounds; $i++) {
  Write-SupervisorLog "Worker round $i started."

  if (Test-TodoCompleted $TodoPath) {
    Write-SupervisorLog "TODO.md has no pending tasks. Running convergence final check."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "run-convergence.ps1") -ProjectRoot $ProjectRoot -Mode $Mode -MaxRounds 5
    $exitCode = $LASTEXITCODE
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "supervisor-final-check"
    exit $exitCode
  }

  if (Test-TodoBlocked $TodoPath) {
    Write-SupervisorLog "TODO.md contains a BLOCKED section. Stop supervisor."
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "supervisor-blocked"
    exit 4
  }

  $logFile = Join-Path $runDir "worker-round-$i.log"
  $prompt = @"
$workerPrompt

Project root:
$ProjectRoot

Current task file:
$TodoPath

This is worker round $i of $MaxWorkerRounds. Perform exactly one TODO task, update TODO.md and HANDOFF.md, then stop.
"@

  try {
    if ($NewWindow) {
      $promptFile = Join-Path $runDir "worker-round-$i.prompt.md"
      $prompt | Set-Content -LiteralPath $promptFile -Encoding UTF8
      $runner = Join-Path $PSScriptRoot "run-codex-worker-once.ps1"
      $process = Start-Process powershell.exe `
        -ArgumentList @(
          "-NoProfile",
          "-ExecutionPolicy", "Bypass",
          "-File", "`"$runner`"",
          "-ProjectRoot", "`"$ProjectRoot`"",
          "-PromptFile", "`"$promptFile`"",
          "-LogFile", "`"$logFile`""
        ) `
        -Wait `
        -PassThru `
        -WindowStyle Normal
      $workerExit = $process.ExitCode
    } else {
      $oldErrorActionPreference = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        $prompt | codex exec --cd $ProjectRoot --sandbox workspace-write - 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $logFile
        $workerExit = $LASTEXITCODE
      } finally {
        $ErrorActionPreference = $oldErrorActionPreference
      }
    }

    Write-SupervisorLog "Worker round $i finished with exit code $workerExit. Log: $logFile"
    if ($workerExit -ne 0) {
      Add-Content -Encoding UTF8 -LiteralPath $TodoPath -Value "`r`n## BLOCKED`r`nWorker round $i exited with code $workerExit. Log: $logFile`r`n"
      & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "worker-round-$i-failed"
      exit $workerExit
    }
  } catch {
    Write-SupervisorLog "Worker round $i failed: $($_.Exception.Message)"
    Add-Content -Encoding UTF8 -LiteralPath $TodoPath -Value "`r`n## BLOCKED`r`nWorker round $i failed: $($_.Exception.Message)`r`n"
    & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "worker-exception"
    exit 1
  }

  & powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "worker-round-$i-finished"
  Start-Sleep -Seconds 2
}

Write-SupervisorLog "Max worker rounds reached: $MaxWorkerRounds"
Add-Content -Encoding UTF8 -LiteralPath $TodoPath -Value "`r`n## BLOCKED`r`nMax worker rounds reached: $MaxWorkerRounds.`r`n"
& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "write-handoff.ps1") -ProjectRoot $ProjectRoot -Reason "max-worker-rounds-reached"
exit 2
