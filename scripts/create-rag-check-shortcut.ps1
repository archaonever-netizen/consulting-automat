# Создаёт на рабочем столе ярлык «SHEF RAG Check» для разовой живой проверки RAG
# (запуск против Postgres из .env.local). Не путать с обычным «SHEF Local Lab».
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "SHEF RAG Check.lnk"
$Target = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$Script = Join-Path $Root "scripts\start-rag-check.ps1"

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Target
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Script`""
$Shortcut.WorkingDirectory = $Root
$Shortcut.Description = "SHEF: живая проверка RAG против Postgres (.env.local)"
$Shortcut.Save()

Write-Host "Создан ярлык: $ShortcutPath"
