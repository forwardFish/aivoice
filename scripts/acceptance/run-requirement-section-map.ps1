param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$round = Get-CurrentConvergenceRound $ProjectRoot

function Get-RequirementDocFiles {
  return @(Get-AERequirementSourceFiles $ProjectRoot | Select-Object -First 40)
}

function Normalize-SectionText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return "" }
  return (($Text.ToLowerInvariant() -replace '\s+', '') -replace '[^\p{L}\p{N}/_-]', '')
}

function Get-SectionPriority([string]$Text) {
  if ($Text -match "(?i)\bP0\b|must|required|critical|core|必须|核心|验收|主流程|闭环") { return "P0" }
  if ($Text -match "(?i)\bP1\b|should|important|需要|页面|接口|功能|用户|系统") { return "P1" }
  return "P2"
}

function Get-SectionPriority([string]$Text) {
  return (Get-AETextPriority $Text)
}

function Get-SectionType([string]$Title, [string]$Body) {
  $text = ("$Title`n$Body").ToLowerInvariant()
  if ($text -match '(?i)\b(usage|command|instruction|install|installation|setup|example|quickstart|readme|handoff|resume)\b|project root:|requirement docs:|ui references:|\$auto-execute|executionpolicy bypass|run-status\.ps1|resume-convergence\.ps1|run-convergence\.ps1') { return "documentation" }
  if ($text -match '(?i)\bout[-_ ]?of[-_ ]?scope|defer|future|later|not in scope|\u6682\u4e0d|\u4e0d\u5728\u8303\u56f4|\u672a\u6765|\u540e\u7eed|\u4e0d\u505a') { return "out_of_scope" }
  if ($text -match '(?i)business|commercial|value|positioning|\u5546\u4e1a|\u4ef7\u503c|\u5b9a\u4f4d') { return "business" }
  if ($text -match '(?i)background|market|persona|vision|why|\u80cc\u666f|\u613f\u666f|\u5e02\u573a|\u7528\u6237\u753b\u50cf|\u4e3a\u4ec0\u4e48') { return "background" }
  if ($text -match '(?i)\bui\b|page|screen|visual|design|screenshot|interaction|component|\u9875\u9762|\u754c\u9762|\u89c6\u89c9|\u8bbe\u8ba1\u7a3f|\u622a\u56fe|\u4ea4\u4e92|\u7ec4\u4ef6') { return "ui" }
  if ($text -match '(?i)\bapi\b|endpoint|field|request|response|status code|webhook|\u63a5\u53e3|\u5b57\u6bb5|\u8bf7\u6c42|\u54cd\u5e94|\u72b6\u6001\u7801') { return "api" }
  if ($text -match '(?i)performance|security|permission|stability|compatibility|availability|logging|monitoring|\u6027\u80fd|\u5b89\u5168|\u6743\u9650|\u7a33\u5b9a|\u517c\u5bb9|\u53ef\u7528\u6027|\u65e5\u5fd7|\u76d1\u63a7') { return "nonfunctional" }
  if ($text -match '(?i)feature|function|flow|acceptance|submit|create|generate|view|edit|delete|\u529f\u80fd|\u6d41\u7a0b|\u7528\u6237\u53ef\u4ee5|\u5fc5\u987b|\u9700\u8981|\u9a8c\u6536|\u95ed\u73af|\u63d0\u4ea4|\u521b\u5efa|\u751f\u6210|\u67e5\u770b|\u7f16\u8f91|\u5220\u9664') { return "functional" }
  return "unknown"
}

function Find-CoverageIds($SectionText, $Items, [string]$IdField) {
  $sectionNorm = Normalize-SectionText $SectionText
  if ([string]::IsNullOrWhiteSpace($sectionNorm)) { return @() }
  $covered = @()
  foreach ($item in @($Items)) {
    $id = [string]$item.$IdField
    if ([string]::IsNullOrWhiteSpace($id) -and $IdField -eq "storyId") { $id = [string]$item.id }
    if ([string]::IsNullOrWhiteSpace($id)) { continue }
    $candidateText = (@($item.title,$item.description,$item.goal) + @($item.acceptance) + @($item.acceptanceCriteria)) -join " "
    $candidateTitleNorm = Normalize-SectionText ((@($item.title,$item.sourceSection) | Where-Object { ![string]::IsNullOrWhiteSpace([string]$_) }) -join " ")
    if (![string]::IsNullOrWhiteSpace($candidateTitleNorm) -and ($sectionNorm.Contains($candidateTitleNorm) -or $candidateTitleNorm.Contains($sectionNorm))) { $covered += $id; continue }
    $candidateNorm = Normalize-SectionText $candidateText
    if ([string]::IsNullOrWhiteSpace($candidateNorm)) { continue }
    if ($sectionNorm.Contains($candidateNorm) -or $candidateNorm.Contains($sectionNorm)) { $covered += $id; continue }
    $tokens = @([regex]::Matches($sectionNorm, '\p{L}{2,}|\p{N}+(/[A-Za-z0-9_-]+)?') | ForEach-Object { $_.Value } | Where-Object { $_.Length -ge 2 } | Select-Object -First 12)
    $hits = @($tokens | Where-Object { $candidateNorm.Contains($_) }).Count
    if ($tokens.Count -gt 0 -and $hits -ge [Math]::Min(2, $tokens.Count)) { $covered += $id }
  }
  return @($covered | Sort-Object -Unique)
}

try { $requirements = Get-Content -LiteralPath $p.RequirementTarget -Raw | ConvertFrom-Json } catch { $requirements = $null }
try { $stories = Get-Content -LiteralPath $p.StoryTarget -Raw | ConvertFrom-Json } catch { $stories = $null }
$reqItems = if ($null -ne $requirements -and $null -ne $requirements.requirements) { @($requirements.requirements) } else { @() }
$storyItems = if ($null -ne $stories -and $null -ne $stories.stories) { @($stories.stories) } else { @() }
$sections = @()
$idx = 1

foreach ($file in (Get-RequirementDocFiles)) {
  try { $lines = @(Get-Content -LiteralPath $file.FullName -ErrorAction Stop) } catch { continue }
  $headings = @()
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]
    if ($line -match "^(#{1,6})\s+(.+)$") {
      $headings += [PSCustomObject]@{ line=$i; level=$Matches[1].Length; title=$Matches[2].Trim() }
    } elseif ($line -match "^\s*((\u7b2c?[\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e]+[\u7ae0\u8282\u3001\.\uFF0E:\uFF1A])|([0-9]+(\.[0-9]+)*[\u3001\.\uFF0E\)\uFF09:\uFF1A\s]+))\s*(.+?)\s*$") {
      $headings += [PSCustomObject]@{ line=$i; level=2; title=($line.Trim()) }
    } elseif ($line -match "^\s*((第?[一二三四五六七八九十百]+[章节、.．])|([0-9]+(\.[0-9]+)*[、.．\s]+))\s*(.+?)\s*$") {
      $headings += [PSCustomObject]@{ line=$i; level=2; title=($line.Trim()) }
    }
  }
  if ($headings.Count -eq 0 -and $lines.Count -gt 0) {
    $headings += [PSCustomObject]@{ line=0; level=1; title=(Split-Path $file.FullName -Leaf) }
  }
  for ($h = 0; $h -lt $headings.Count; $h++) {
    $heading = $headings[$h]
    $nextLine = if ($h + 1 -lt $headings.Count) { [int]$headings[$h + 1].line } else { $lines.Count }
    $body = if ($nextLine -gt $heading.line + 1) { ($lines[($heading.line + 1)..($nextLine - 1)] -join "`n") } else { "" }
    $digest = (($body -replace '\s+', ' ').Trim())
    if ($digest.Length -gt 180) { $digest = $digest.Substring(0, 180) }
    $combined = "$($heading.title) $body"
    $coveredReqs = Find-CoverageIds $combined $reqItems "id"
    $coveredStories = Find-CoverageIds $combined $storyItems "storyId"
    $priority = Get-SectionPriority $combined
    $sectionType = Get-SectionType $heading.title $body
    $requiresImplementation = ($sectionType -in @("functional","ui","api","nonfunctional"))
    $coverage = if (($coveredReqs.Count + $coveredStories.Count) -gt 0) {
      "PASS"
    } elseif ($requiresImplementation -and $priority -in @("P0","P1")) {
      "IN_SCOPE_GAP"
    } elseif ($sectionType -in @("background","business","documentation")) {
      "PASS_WITH_LIMITATION"
    } elseif ($sectionType -eq "out_of_scope") {
      "DEFERRED"
    } elseif ($sectionType -eq "unknown") {
      "MANUAL_REVIEW_REQUIRED"
    } else {
      "DEFERRED"
    }
    $sectionId = "SEC-$('{0:D3}' -f $idx)"
    $sections += [PSCustomObject]@{
      sectionId = $sectionId
      source = Get-RelativeEvidencePath $ProjectRoot $file.FullName
      title = $heading.title
      headingLevel = $heading.level
      lineStart = $heading.line + 1
      lineEnd = $nextLine
      textDigest = $digest
      sectionType = $sectionType
      requiresImplementation = $requiresImplementation
      priority = $priority
      coveredByRequirementIds = $coveredReqs
      coveredByStoryIds = $coveredStories
      coverageStatus = $coverage
      evidence = @("docs/auto-execute/requirement-target.json","docs/auto-execute/story-target.json")
    }
    if ($coverage -eq "IN_SCOPE_GAP") {
      Add-Gap $ProjectRoot $round "GAP-$sectionId-COVERAGE" "requirement-section" "IN_SCOPE_GAP" "P0/P1 PRD section '$($heading.title)' has no requirement/story coverage." "Map this section into requirement-target.json and story-target.json." (Get-RelativeEvidencePath $ProjectRoot $file.FullName)
    }
    $idx++
  }
}

$gapCount = @($sections | Where-Object { $_.coverageStatus -eq "IN_SCOPE_GAP" }).Count
$manualCount = @($sections | Where-Object { $_.coverageStatus -eq "MANUAL_REVIEW_REQUIRED" }).Count
$limitationCount = @($sections | Where-Object { $_.coverageStatus -eq "PASS_WITH_LIMITATION" }).Count
$status = if ($gapCount -gt 0) { "HARD_FAIL" } elseif ($manualCount -gt 0) { "MANUAL_REVIEW_REQUIRED" } elseif ($limitationCount -gt 0) { "PASS_WITH_LIMITATION" } elseif ($sections.Count -gt 0) { "PASS" } else { "MANUAL_REVIEW_REQUIRED" }
@{
  schemaVersion = $AE_SCHEMA_VERSION
  generatedAt = (Get-Date).ToString("s")
  status = $status
  sourceDocuments = @((Get-RequirementDocFiles) | ForEach-Object { Get-RelativeEvidencePath $ProjectRoot $_.FullName })
  ignoredReferences = @(Get-AEIgnoredRequirementReferences $ProjectRoot)
  sections = $sections
  summary = @{
    total = $sections.Count
    p0 = @($sections | Where-Object { $_.priority -eq "P0" }).Count
    p1 = @($sections | Where-Object { $_.priority -eq "P1" }).Count
    requiresImplementation = @($sections | Where-Object { $_.requiresImplementation -eq $true }).Count
    manualReviewRequired = $manualCount
    limitations = $limitationCount
    gaps = $gapCount
  }
} | ConvertTo-Json -Depth 40 | Set-Content -Encoding UTF8 $p.RequirementSectionMap

Write-LaneResult $ProjectRoot "requirement-section-map" $status @() @((Get-RelativeEvidencePath $ProjectRoot $p.RequirementSectionMap),(Get-RelativeEvidencePath $ProjectRoot $p.GapListJson)) $(if ($gapCount -gt 0) { @("$gapCount P0/P1 PRD section coverage gap(s)") } else { @() }) @("Normalize uncovered P0/P1 PRD sections into requirement/story targets.")
Add-VerificationResult $ProjectRoot "requirement-section-map" $status "$($sections.Count) section(s), $gapCount P0/P1 coverage gap(s)" $p.RequirementSectionMap
Write-Host "[$status] requirement-section-map: $($sections.Count) section(s), $gapCount gap(s)"
exit (Get-AEExitCode $status)
