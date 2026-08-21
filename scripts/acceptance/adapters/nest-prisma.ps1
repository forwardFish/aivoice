param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "nest-prisma"
  detects = @("prisma/schema.prisma", "backend/prisma/schema.prisma")
  recommendedCommands = @("npm run build", "npm test", "npm run test:api", "npm run test:e2e:runtime")
  safetyNotes = @("Do not run prisma migrate/reset/db push against production DB")
} | ConvertTo-Json -Depth 10
