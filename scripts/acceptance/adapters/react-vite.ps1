param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "react-vite"
  detects = @("vite.config.js", "vite.config.ts")
  recommendedCommands = @("npm run lint", "npm run test", "npm run build")
} | ConvertTo-Json -Depth 10
