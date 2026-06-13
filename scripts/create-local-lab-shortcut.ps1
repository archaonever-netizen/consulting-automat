$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "SHEF Local Lab.lnk"
$Target = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Script = Join-Path $Root "scripts\start-local-lab.ps1"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Target
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$Script`""
$Shortcut.WorkingDirectory = $Root
$Shortcut.Description = "Start SHEF local lab"
$Shortcut.Save()

Write-Host "Created shortcut: $ShortcutPath"
