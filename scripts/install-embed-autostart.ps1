# Register current-user logon task for embed stack (no admin required)
# Usage: powershell -NoProfile -File D:\nav-site\scripts\install-embed-autostart.ps1
# Uninstall: scripts\uninstall-embed-autostart.ps1

$ErrorActionPreference = "Stop"
$Root = "D:\nav-site"
$TaskName = "nav-site-embed-stack"
$Ensure = Join-Path $Root "scripts\ensure-embed-stack.ps1"

if (-not (Test-Path $Ensure)) { throw "missing $Ensure" }

$ps = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
if (-not (Test-Path $ps)) { $ps = "powershell.exe" }

$arg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Ensure`""
$action = New-ScheduledTaskAction -Execute $ps -Argument $arg -WorkingDirectory $Root

# Delay 90s after logon so network / local proxy can come up
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$trigger.Delay = "PT90S"

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 2)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "nav-site: start native embed + Cloudflare Named Tunnel after logon" | Out-Null

Write-Host "OK scheduled task: $TaskName"
Write-Host "  trigger: AtLogOn + 90s delay (user=$env:USERNAME)"
Write-Host "  script:  $Ensure"
Write-Host "  log:     $(Join-Path $Root '.embed-autostart.log')"
Write-Host "  test now: powershell -NoProfile -File $Ensure"
Write-Host "  uninstall: powershell -NoProfile -File $(Join-Path $Root 'scripts\uninstall-embed-autostart.ps1')"
