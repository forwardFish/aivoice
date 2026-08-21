param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "next"
  detects = @("next.config.js", "next.config.ts")
  recommendedCommands = @("pnpm lint", "pnpm test", "pnpm build", "pnpm test:smoke")
} | ConvertTo-Json -Depth 10
