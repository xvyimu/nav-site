# Sync nav-dev credentials into Vercel Preview env (never prints secret values).
# Usage: powershell -NoProfile -File D:\nav-site\scripts\sync-preview-env.ps1
# Requires: vercel CLI logged in, linked project .vercel/project.json

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Root) { $Root = "D:\nav-site" }
Set-Location $Root

function Load-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#")) { continue }
    $eq = $t.IndexOf("=")
    if ($eq -lt 1) { continue }
    $k = $t.Substring(0, $eq).Trim()
    $v = $t.Substring($eq + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

function Get-JwtRef([string]$Token) {
  try {
    $payload = $Token.Split(".")[1]
    $pad = $payload.Length % 4
    if ($pad -gt 0) { $payload += ("=" * (4 - $pad)) }
    $json = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload.Replace("-", "+").Replace("_", "/")))
    $obj = $json | ConvertFrom-Json
    return [string]$obj.ref
  } catch {
    return ""
  }
}

function Add-PreviewEnv([string]$Name, [string]$Value, [switch]$Sensitive) {
  if ([string]::IsNullOrWhiteSpace($Value)) {
    Write-Host "SKIP $Name (empty)"
    return
  }
  $cliArgs = @(
    "env", "add", $Name, "preview",
    "--scope", "aijiai520",
    "--yes",
    "--force",
    "--value", $Value
  )
  if ($Sensitive) { $cliArgs += "--sensitive" }
  Write-Host "SET  $Name → Preview (len=$($Value.Length))"
  & vercel @cliArgs
  if ($LASTEXITCODE -ne 0) { throw "vercel env add failed for $Name (exit $LASTEXITCODE)" }
}

$envMap = Load-DotEnv (Join-Path $Root ".env.local")

$url = $envMap["NEXT_PUBLIC_SUPABASE_URL_DEV"]
if (-not $url) { $url = $envMap["SOURCE_SUPABASE_URL"] }
$anon = $envMap["NEXT_PUBLIC_SUPABASE_ANON_KEY_DEV"]
if (-not $anon) { $anon = $envMap["SOURCE_SUPABASE_ANON_KEY"] }

try {
  $hostName = ([Uri]$url).Host
} catch {
  throw "Invalid Supabase URL for Preview"
}
if ($hostName -match "vyqqbypwrbdcafanzwmj") {
  throw "Refusing: URL points at production project. Use NEXT_PUBLIC_SUPABASE_URL_DEV."
}
if ($hostName -notmatch "nzaocqwumlmbewoddysd") {
  Write-Host "WARN unexpected dev host: $hostName"
}

Write-Host "Preview Supabase host: $hostName"

# Prefer explicit DEV service role; never attach prod service role to Preview.
# Sources (first hit wins): .env.local DEV key → User env SUPABASE_DEV_SERVICE_ROLE
$service = $envMap["SUPABASE_SERVICE_ROLE_KEY_DEV"]
if (-not $service) { $service = $envMap["SOURCE_SUPABASE_SERVICE_ROLE_KEY"] }
if (-not $service) { $service = [Environment]::GetEnvironmentVariable("SUPABASE_DEV_SERVICE_ROLE", "User") }
if (-not $service) { $service = $env:SUPABASE_DEV_SERVICE_ROLE }
$prodRef = "vyqqbypwrbdcafanzwmj"
$devRef = "nzaocqwumlmbewoddysd"
if ($service) {
  $ref = Get-JwtRef $service
  if ($ref -eq $prodRef) {
    Write-Host "WARN refusing service role JWT ref=$ref (production). Preview will get public keys only."
    $service = $null
  } elseif ($ref -and $ref -ne $devRef) {
    Write-Host "WARN service role JWT ref=$ref does not match nav-dev; skipping service role."
    $service = $null
  } else {
    Write-Host "DEV service_role JWT ref=$ref"
  }
}

Add-PreviewEnv "NEXT_PUBLIC_SUPABASE_URL" $url
Add-PreviewEnv "NEXT_PUBLIC_SUPABASE_ANON_KEY" $anon -Sensitive

if ($service) {
  Add-PreviewEnv "SUPABASE_SERVICE_ROLE_KEY" $service -Sensitive
} else {
  Write-Host "NOTE Preview without SUPABASE_SERVICE_ROLE_KEY_DEV — public read OK; admin/service writes may fail."
  Write-Host "     Add nav-dev service_role to .env.local as SUPABASE_SERVICE_ROLE_KEY_DEV then re-run."
}

Add-PreviewEnv "AUTH_SECRET" $envMap["AUTH_SECRET"] -Sensitive
if ($envMap["ADMIN_PASSWORD_HASH"]) {
  Add-PreviewEnv "ADMIN_PASSWORD_HASH" $envMap["ADMIN_PASSWORD_HASH"] -Sensitive
} else {
  Write-Host "WARN ADMIN_PASSWORD_HASH missing"
}

$site = $envMap["NEXT_PUBLIC_SITE_URL"]
if (-not $site) { $site = "https://yuanjia1314.ccwu.cc" }
Add-PreviewEnv "NEXT_PUBLIC_SITE_URL" $site

if ($envMap["NEXT_PUBLIC_SENTRY_DSN"]) {
  Add-PreviewEnv "NEXT_PUBLIC_SENTRY_DSN" $envMap["NEXT_PUBLIC_SENTRY_DSN"]
}
if ($envMap["SENTRY_DSN"]) {
  Add-PreviewEnv "SENTRY_DSN" $envMap["SENTRY_DSN"] -Sensitive
}
# Embed: always point Preview at the public Worker (never loopback from .env.local).
$embedUrl = "https://nav-site-embed-proxy.xiej4352.workers.dev"
Add-PreviewEnv "EMBED_SERVER_URL" $embedUrl

# Prefer repo-local .embed-api-key.local (same key native embed/tunnel uses).
# Do NOT fall back to User EMBEDDING_API_KEY — that may be a different product key.
$embedKey = $envMap["EMBED_SERVER_API_KEY"]
$embedKeyFile = Join-Path $Root ".embed-api-key.local"
if (-not $embedKey -and (Test-Path $embedKeyFile)) {
  $embedKey = (Get-Content -Path $embedKeyFile -Raw -Encoding utf8).Trim()
  Write-Host "EMBED key loaded from .embed-api-key.local (len=$($embedKey.Length))"
}
if ($embedKey) {
  Add-PreviewEnv "EMBED_SERVER_API_KEY" $embedKey -Sensitive
} else {
  Write-Host "WARN EMBED_SERVER_API_KEY missing — Preview embedding will skip"
}

foreach ($k in @(
  "RESOURCE_LIBRARY_ANON_KEY",
  "RESOURCE_LIBRARY_API_KEY",
  "RESOURCE_LIBRARY_SERVICE_ROLE_KEY",
  "RESOURCE_LIBRARY_PUBLIC_PAGES_SOURCE",
  "RESOURCE_LIBRARY_PUBLIC_RATING_STATS_RPC",
  "NEXT_PUBLIC_RESOURCE_LIBRARY_API_KEY"
)) {
  if ($envMap[$k]) {
    $sens = $k -match "KEY|SECRET|PASSWORD"
    if ($sens) { Add-PreviewEnv $k $envMap[$k] -Sensitive } else { Add-PreviewEnv $k $envMap[$k] }
  }
}

Write-Host ""
Write-Host "OK Preview env sync finished (nav-dev + embed worker)."
Write-Host "SSO Protection should stay null for private-repo probes (PATCH /v9/projects)."
Write-Host "Redeploy: vercel redeploy <preview-url> --scope aijiai520"
