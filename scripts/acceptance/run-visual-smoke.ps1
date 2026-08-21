param([string]$ProjectRoot = (Get-Location).Path, [string]$Mode = "fast")
. "$PSScriptRoot\lib.ps1"
$ProjectRoot = Get-ProjectRoot $ProjectRoot
Initialize-Layout $ProjectRoot
Initialize-MachineFiles $ProjectRoot
$p = Get-AEPaths $ProjectRoot
$inventory = Join-Path $p.Docs "UI_REFERENCE_INVENTORY.md"
"# UI Reference Inventory`nGenerated: $(Get-Date)`n" | Set-Content -Encoding UTF8 $inventory
$count = 0
foreach ($dir in @((Join-Path $ProjectRoot "docs\design\UI"), (Join-Path $ProjectRoot "docs\UI"))) {
  if (Test-Path $dir) {
    Add-Content -Encoding UTF8 $inventory "`n## $dir"
    Get-ChildItem $dir -Recurse -File -Include *.png,*.jpg,*.jpeg,*.webp,*.gif,*.html | ForEach-Object { $count++; Add-Content -Encoding UTF8 $inventory "- $($_.FullName)" }
  }
}
if ($count -eq 0) {
  Add-Blocker $ProjectRoot "visual-smoke" "DEFERRED" "No UI references found"
  Write-LaneResult $ProjectRoot "visual" "DEFERRED" @() @((Get-RelativeEvidencePath $ProjectRoot $inventory)) @("No UI references found") @()
  Write-Host "[DEFERRED] visual-smoke"
}
else {
  Add-VerificationResult $ProjectRoot "visual:inventory" "PASS" "$count UI references indexed" $inventory
  Add-EvidenceItem $ProjectRoot "visual" $inventory "UI reference inventory"
  Write-Host "[PASS] UI inventory: $count"
}
Add-VerificationResult $ProjectRoot "visual-smoke" "MANUAL_REVIEW_REQUIRED" "Screenshot automation is project-specific; inventory generated" $inventory
if ($count -gt 0) { Write-LaneResult $ProjectRoot "visual" "MANUAL_REVIEW_REQUIRED" @() @((Get-RelativeEvidencePath $ProjectRoot $inventory)) @("Screenshot automation is project-specific") @("Add project-specific screenshot capture or visual verdict adapter.") }
