param(
  [Parameter(Mandatory = $true)][string]$SourceEnv,
  [Parameter(Mandatory = $true)][string]$TargetEnv,
  [Parameter(Mandatory = $true)][string]$NewAppId,
  [Parameter(Mandatory = $true)][string]$SecretDir
)

$ErrorActionPreference = 'Stop'

function Read-EnvMap([string]$Path) {
  $map = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([^#=\s]+)\s*=\s*(.*)\s*$') {
      $map[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
  }
  return $map
}

function Resolve-EnvPath([string]$EnvFile, [string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return '' }
  if ([IO.Path]::IsPathRooted($Value)) { return [IO.Path]::GetFullPath($Value) }
  return [IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $EnvFile) $Value))
}

function Merge-EnvFile([string]$Path, [System.Collections.Specialized.OrderedDictionary]$Updates) {
  $lines = [Collections.Generic.List[string]]::new()
  if (Test-Path -LiteralPath $Path) {
    foreach ($line in Get-Content -LiteralPath $Path) { $lines.Add($line) }
  }
  foreach ($key in $Updates.Keys) {
    $replacement = "$key=$($Updates[$key])"
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
      if ($lines[$i] -match "^\s*$([regex]::Escape([string]$key))\s*=") { $index = $i; break }
    }
    if ($index -ge 0) { $lines[$index] = $replacement } else { $lines.Add($replacement) }
  }
  [IO.File]::WriteAllLines($Path, $lines, [Text.UTF8Encoding]::new($false))
}

if (!(Test-Path -LiteralPath $SourceEnv)) { throw "Source env file does not exist: $SourceEnv" }
if (!(Test-Path -LiteralPath $TargetEnv)) { throw "Target env file does not exist: $TargetEnv" }
if ($NewAppId -notmatch '^wx[a-zA-Z0-9]{16}$') { throw 'NewAppId is not a valid mini-program AppID shape' }

$source = Read-EnvMap $SourceEnv
$requiredSource = @(
  'WECHAT_PAY_MCH_ID',
  'WECHAT_PAY_SERIAL_NO',
  'WECHAT_PAY_PRIVATE_KEY_PATH',
  'WECHAT_PAY_MERCHANT_CERT_PATH',
  'WECHAT_PAY_API_V3_KEY'
)
foreach ($key in $requiredSource) {
  if ([string]::IsNullOrWhiteSpace([string]$source[$key])) { throw "Source payment config is missing $key" }
}
if (([string]$source['WECHAT_PAY_API_V3_KEY']).Length -ne 32) {
  throw 'Source WECHAT_PAY_API_V3_KEY is not 32 characters'
}

$sourcePrivateKey = Resolve-EnvPath $SourceEnv ([string]$source['WECHAT_PAY_PRIVATE_KEY_PATH'])
$sourceMerchantCert = Resolve-EnvPath $SourceEnv ([string]$source['WECHAT_PAY_MERCHANT_CERT_PATH'])
foreach ($file in @($sourcePrivateKey, $sourceMerchantCert)) {
  if (!(Test-Path -LiteralPath $file -PathType Leaf)) { throw "Referenced certificate file does not exist: $file" }
}

$resolvedSecretDir = [IO.Path]::GetFullPath($SecretDir)
if ($resolvedSecretDir.Length -lt 10 -or $resolvedSecretDir -match '^[A-Za-z]:\\?$') {
  throw 'SecretDir is too broad'
}
New-Item -ItemType Directory -Force -Path $resolvedSecretDir | Out-Null
$targetPrivateKey = Join-Path $resolvedSecretDir 'apiclient_key.pem'
$targetMerchantCert = Join-Path $resolvedSecretDir 'apiclient_cert.pem'
Copy-Item -LiteralPath $sourcePrivateKey -Destination $targetPrivateKey -Force
Copy-Item -LiteralPath $sourceMerchantCert -Destination $targetMerchantCert -Force

$backupDir = Join-Path (Split-Path -Parent $resolvedSecretDir) 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupPath = Join-Path $backupDir ('.env.local.before-wechat-pay-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
Copy-Item -LiteralPath $TargetEnv -Destination $backupPath

$updates = [ordered]@{
  WECHAT_APP_ID = $NewAppId
  WECHAT_APP_SECRET = ''
  WECHAT_MOCK_LOGIN = 'false'
  WECHAT_PAY_MCH_ID = [string]$source['WECHAT_PAY_MCH_ID']
  WECHAT_PAY_SERIAL_NO = [string]$source['WECHAT_PAY_SERIAL_NO']
  WECHAT_PAY_PRIVATE_KEY_PATH = $targetPrivateKey
  WECHAT_PAY_MERCHANT_CERT_PATH = $targetMerchantCert
  WECHAT_PAY_API_V3_KEY = [string]$source['WECHAT_PAY_API_V3_KEY']
  WECHAT_PAY_PLATFORM_CERT_PATH = ''
  WECHAT_PAY_PUBLIC_KEY_ID = ''
  WECHAT_PAY_PUBLIC_KEY_PATH = ''
  WECHAT_PAY_NOTIFY_URL = ''
  WECHAT_PAY_DESCRIPTION = '那时的TA-50积分包'
  WECHAT_PAY_TEST_MODE = 'false'
  WECHAT_PAY_TEST_AMOUNT_FEN = '1'
}
Merge-EnvFile $TargetEnv $updates

Write-Output 'Reusable WeChat Pay merchant settings migrated without printing secret values.'
Write-Output "Private key copied: $targetPrivateKey"
Write-Output "Merchant certificate copied: $targetMerchantCert"
Write-Output "Target env backup: $backupPath"
Write-Output 'Still required: new mini-program AppSecret, public HTTPS notify URL, and either WeChat Pay public key + ID or a current platform certificate.'
