param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "python"
  detects = @("pyproject.toml", "requirements.txt")
  recommendedCommands = @("python -m compileall -q .", "python -m pytest -q")
} | ConvertTo-Json -Depth 10
