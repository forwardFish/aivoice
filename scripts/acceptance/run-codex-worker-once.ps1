param(
  [string]$ProjectRoot = (Get-Location).Path,
  [Parameter(Mandatory=$true)][string]$PromptFile,
  [Parameter(Mandatory=$true)][string]$LogFile
)

$ErrorActionPreference = "Stop"
Set-Location $ProjectRoot

if (!(Test-Path -LiteralPath $PromptFile)) { throw "Prompt file missing: $PromptFile" }

$oldErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
  Get-Content -LiteralPath $PromptFile -Raw | codex exec `
    --cd $ProjectRoot `
    --sandbox workspace-write `
    - 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $LogFile
  $workerExit = $LASTEXITCODE
} finally {
  $ErrorActionPreference = $oldErrorActionPreference
}

exit $workerExit
