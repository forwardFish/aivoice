param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "generic"
  detects = @("fallback")
  recommendedCommands = @("build", "test", "lint", "typecheck")
} | ConvertTo-Json -Depth 10
