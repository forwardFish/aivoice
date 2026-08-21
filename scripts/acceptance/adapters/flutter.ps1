param([string]$ProjectRoot = (Get-Location).Path)
@{
  name = "flutter"
  detects = @("pubspec.yaml")
  recommendedCommands = @("flutter analyze", "flutter test", "flutter build web")
} | ConvertTo-Json -Depth 10
