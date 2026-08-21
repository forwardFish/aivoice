param([string]$ProjectRoot = (Get-Location).Path)

function Get-Rel($Root, $Path) {
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($rootFull.Length)
  }
  return $full
}

function Convert-AppRouteToApiPath($Root, $File) {
  $rel = (Get-Rel $Root $File) -replace "\\","/"
  $idx = $rel.IndexOf("/app/api/")
  if ($idx -lt 0 -and $rel.StartsWith("app/api/")) { $idx = -1 }
  $path = if ($idx -ge 0) { $rel.Substring($idx + 5) } else { $rel }
  $path = $path -replace "^app/api/","api/"
  $path = $path -replace "/route\.(ts|tsx|js|jsx)$",""
  $path = "/" + $path
  $path = $path -replace "\[([^\]]+)\]","{$1}"
  return $path
}

function Convert-PagesRouteToApiPath($Root, $File) {
  $rel = (Get-Rel $Root $File) -replace "\\","/"
  $idx = $rel.IndexOf("/pages/api/")
  if ($idx -lt 0 -and $rel.StartsWith("pages/api/")) { $idx = -1 }
  $path = if ($idx -ge 0) { $rel.Substring($idx + 7) } else { $rel }
  $path = $path -replace "^pages/api/","api/"
  $path = $path -replace "\.(ts|tsx|js|jsx)$",""
  $path = "/" + $path
  $path = $path -replace "/index$",""
  $path = $path -replace "\[([^\]]+)\]","{$1}"
  return $path
}

$apiDefinitions = @()
$appRoutes = Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -Include route.ts,route.tsx,route.js,route.jsx -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\app\\api\\" -and $_.FullName -notmatch "\\node_modules\\|\\.next\\|\\dist\\|\\build\\" }
foreach ($file in $appRoutes) {
  try { $text = Get-Content -LiteralPath $file.FullName -Raw } catch { $text = "" }
  if ($null -eq $text) { $text = "" }
  $path = Convert-AppRouteToApiPath $ProjectRoot $file.FullName
  $methods = @()
  foreach ($m in [regex]::Matches($text, 'export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b')) {
    $methods += $m.Groups[2].Value
  }
  if ($methods.Count -eq 0) { $methods = @("UNKNOWN") }
  foreach ($method in ($methods | Sort-Object -Unique)) {
    $apiDefinitions += [PSCustomObject]@{ framework="next"; method=$method; path=$path; file=Get-Rel $ProjectRoot $file.FullName; source="app-router" }
  }
}

$pagesRoutes = Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -Include *.ts,*.tsx,*.js,*.jsx -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match "\\pages\\api\\" -and $_.FullName -notmatch "\\node_modules\\|\\.next\\|\\dist\\|\\build\\" }
foreach ($file in $pagesRoutes) {
  $apiDefinitions += [PSCustomObject]@{ framework="next"; method="UNKNOWN"; path=(Convert-PagesRouteToApiPath $ProjectRoot $file.FullName); file=Get-Rel $ProjectRoot $file.FullName; source="pages-api" }
}

@{ apiDefinitions=$apiDefinitions; frontendCalls=@(); generatedAt=(Get-Date).ToString("s") } | ConvertTo-Json -Depth 20
