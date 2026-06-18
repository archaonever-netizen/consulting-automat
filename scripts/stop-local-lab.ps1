$ErrorActionPreference = "SilentlyContinue"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $Root ".local-lab"

foreach ($name in @("frontend.pid", "backend.pid")) {
    $path = Join-Path $PidDir $name
    if (-not (Test-Path $path)) { continue }
    $pidValue = Get-Content $path | Select-Object -First 1
    if ($pidValue -and (Get-Process -Id $pidValue)) {
        Stop-Process -Id $pidValue -Force
    }
    Remove-Item $path -Force
}
