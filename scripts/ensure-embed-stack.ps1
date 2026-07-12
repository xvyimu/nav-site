# Idempotent: start native embed + Named Tunnel (manual or scheduled task)
# Usage: powershell -NoProfile -File D:\nav-site\scripts\ensure-embed-stack.ps1
# Optional: -SkipTunnel  (origin only)

param(
  [switch]$SkipTunnel
)

$ErrorActionPreference = "Stop"
$Root = "D:\nav-site"
$Log = Join-Path $Root ".embed-autostart.log"
$Native = Join-Path $Root "scripts\start-embed-native.ps1"
$Tunnel = Join-Path $Root "scripts\start-embed-tunnel.ps1"

function Write-Log([string]$Message) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $Log -Value $line -Encoding utf8
  Write-Host $line
}

if (-not (Test-Path $Root)) { throw "missing root $Root" }
if (-not (Test-Path $Native)) { throw "missing $Native" }
if (-not $SkipTunnel -and -not (Test-Path $Tunnel)) { throw "missing $Tunnel" }

Write-Log "ensure-embed-stack start SkipTunnel=$SkipTunnel"

# 1) origin
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Native
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    throw "start-embed-native exit $LASTEXITCODE"
  }
  Write-Log "native ok"
} catch {
  Write-Log "native FAIL: $($_.Exception.Message)"
  throw
}

if ($SkipTunnel) {
  Write-Log "skip tunnel"
  exit 0
}

# 2) tunnel (script re-probes origin)
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Tunnel
  if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
    throw "start-embed-tunnel exit $LASTEXITCODE"
  }
  Write-Log "tunnel ok"
} catch {
  Write-Log "tunnel FAIL: $($_.Exception.Message)"
  throw
}

# 3) local + public health
# Named Tunnel host may Bot-Fight default PowerShell UA; use production client UA.
$healthHeaders = @{ "User-Agent" = "nav-site-embed-client/1.0" }

try {
  $local = Invoke-WebRequest -Uri "http://127.0.0.1:18003/health" -Headers $healthHeaders -UseBasicParsing -TimeoutSec 8
  Write-Log "local health $($local.StatusCode) $($local.Content)"
} catch {
  Write-Log "local health FAIL: $($_.Exception.Message)"
  exit 1
}

$publicOk = $false
foreach ($url in @(
  "https://nav-site-embed-proxy.xiej4352.workers.dev/health",
  "https://embed.aijiaqi.ccwu.cc/health"
)) {
  try {
    $pub = Invoke-WebRequest -Uri $url -Headers $healthHeaders -UseBasicParsing -TimeoutSec 15
    Write-Log "public health $url $($pub.StatusCode) $($pub.Content)"
    $publicOk = $true
    break
  } catch {
    Write-Log "public health $url FAIL: $($_.Exception.Message)"
  }
}
if (-not $publicOk) {
  Write-Log "public health all FAIL"
  exit 1
}

Write-Log "ensure-embed-stack done"
exit 0
