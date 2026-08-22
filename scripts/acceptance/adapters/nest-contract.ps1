param([string]$ProjectRoot = (Get-Location).Path)

function Get-Rel($Root, $Path) {
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($rootFull.Length)
  }
  return $full
}

function Join-ApiPath($A, $B) {
  $a2 = ([string]$A).Trim("/")
  $b2 = ([string]$B).Trim("/")
  $joined = (@($a2, $b2) | Where-Object { $_ }) -join "/"
  if ([string]::IsNullOrWhiteSpace($joined)) { return "/" }
  return "/" + ($joined -replace ":", "{") -replace "(\{[^/]+)$", '$1}'
}

$apiDefinitions = @()
$sourceRoots = @()
$rootSrc = Join-Path $ProjectRoot "src"
if (Test-Path -LiteralPath $rootSrc) { $sourceRoots += $rootSrc }
$appsRoot = Join-Path $ProjectRoot "apps"
if (Test-Path -LiteralPath $appsRoot) {
  $sourceRoots += @(Get-ChildItem -LiteralPath $appsRoot -Directory -ErrorAction SilentlyContinue |
    ForEach-Object { Join-Path $_.FullName "src" } |
    Where-Object { Test-Path -LiteralPath $_ })
}
$files = @($sourceRoots | ForEach-Object {
  Get-ChildItem -LiteralPath $_ -Recurse -File -Include *.controller.ts,*.controller.js -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch "\\node_modules\\|\\dist\\|\\build\\" }
})
foreach ($file in $files) {
  try { $text = Get-Content -LiteralPath $file.FullName -Raw } catch { $text = "" }
  if ($null -eq $text) { $text = "" }
  $base = ""
  $controller = [regex]::Match($text, '@Controller\(\s*["'']?([^"'')]+)?["'']?\s*\)')
  if ($controller.Success) { $base = $controller.Groups[1].Value }
  foreach ($m in [regex]::Matches($text, '@(Get|Post|Put|Patch|Delete)\(\s*["'']?([^"'')]+)?["'']?\s*\)')) {
    $method = $m.Groups[1].Value.ToUpperInvariant()
    $sub = $m.Groups[2].Value
    $apiDefinitions += [PSCustomObject]@{ framework="nest"; method=$method; path=Join-ApiPath $base $sub; file=Get-Rel $ProjectRoot $file.FullName; source="controller" }
  }
}

@{ apiDefinitions=$apiDefinitions; frontendCalls=@(); generatedAt=(Get-Date).ToString("s") } | ConvertTo-Json -Depth 20
