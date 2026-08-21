param([string]$ProjectRoot = (Get-Location).Path)

function Get-Rel($Root, $Path) {
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $full.Substring($rootFull.Length)
  }
  return $full
}

$frontendCalls = @()
$files = Get-ChildItem -LiteralPath $ProjectRoot -Recurse -File -Include *.dart -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\.dart_tool\\|\\build\\" }
foreach ($file in $files) {
  try { $text = Get-Content -LiteralPath $file.FullName -Raw } catch { $text = "" }
  if ($null -eq $text) { $text = "" }
  $rel = Get-Rel $ProjectRoot $file.FullName
  foreach ($m in [regex]::Matches($text, '(?i)\b(get|post|put|patch|delete)\s*\(\s*(Uri\.parse\()?["'']([^"'']+/[^"'']*)["'']')) {
    $frontendCalls += [PSCustomObject]@{ framework="flutter"; method=$m.Groups[1].Value.ToUpperInvariant(); path=$m.Groups[3].Value; file=$rel; source="http" }
  }
  foreach ($m in [regex]::Matches($text, '(?i)\bdio\.(get|post|put|patch|delete)\s*\(\s*["'']([^"'']+/[^"'']*)["'']')) {
    $frontendCalls += [PSCustomObject]@{ framework="flutter"; method=$m.Groups[1].Value.ToUpperInvariant(); path=$m.Groups[2].Value; file=$rel; source="dio" }
  }
}

@{ apiDefinitions=@(); frontendCalls=$frontendCalls; generatedAt=(Get-Date).ToString("s") } | ConvertTo-Json -Depth 20
