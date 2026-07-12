# Uninstall nav-site embed logon task
# Usage: powershell -NoProfile -File D:\nav-site\scripts\uninstall-embed-autostart.ps1

$ErrorActionPreference = "Continue"
$TaskName = "nav-site-embed-stack"

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $existing) {
  Write-Host "task not found: $TaskName"
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "OK removed task: $TaskName"
