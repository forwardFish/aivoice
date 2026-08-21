param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "node-api"
  detects = @("package.json")
  recommendedCommands = @("npm run build", "npm test", "npm run test:api", "npm run test:e2e")
} | ConvertTo-Json -Depth 10
