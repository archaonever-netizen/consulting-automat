param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Logs = Join-Path $Root "logs"
$PidDir = Join-Path $Root ".local-lab"
$BrowserProfile = Join-Path $PidDir "browser-profile"
$Python = Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$BackendPort = 8010
$FrontendPort = 5174
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://127.0.0.1:$FrontendPort"
$BackendLog = Join-Path $Logs "backend.log"
$FrontendLog = Join-Path $Logs "frontend.log"
$SetupLog = Join-Path $Logs "setup.log"

New-Item -ItemType Directory -Force -Path $Logs | Out-Null
New-Item -ItemType Directory -Force -Path $PidDir | Out-Null
New-Item -ItemType Directory -Force -Path $BrowserProfile | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $Root "instance") | Out-Null

function Write-SetupLog {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$stamp $Message" | Add-Content -Path $SetupLog
}

function Invoke-Native {
    param(
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$FailureMessage
    )

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $FilePath @Arguments *>> $SetupLog
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }

    if ($code -ne 0) {
        throw "$FailureMessage Exit code: $code. See $SetupLog"
    }
}

function Stop-ByPidFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    $pidValue = Get-Content $Path -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pidValue -and (Get-Process -Id $pidValue -ErrorAction SilentlyContinue)) {
        Stop-Process -Id $pidValue -Force
    }
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
}

Write-SetupLog "Starting local lab from $Root"

if (-not (Test-Path $Python)) {
    throw "Python 3.12 was not found at $Python"
}

if (-not (Test-Path $VenvPython)) {
    Write-SetupLog "Creating Python virtual environment"
    Invoke-Native $Python @("-m", "venv", (Join-Path $Root ".venv")) "Failed to create Python virtual environment."
}

Write-SetupLog "Installing backend dependencies"
Invoke-Native $VenvPython @("-m", "pip", "install", "--upgrade", "pip") "Failed to upgrade pip."
Invoke-Native $VenvPython @("-m", "pip", "install", "-r", (Join-Path $Root "backend\requirements.txt")) "Failed to install backend dependencies."

if (-not (Test-Path (Join-Path $Root "frontend\node_modules"))) {
    Write-SetupLog "Installing frontend dependencies"
    Push-Location (Join-Path $Root "frontend")
    try {
        Invoke-Native "npm.cmd" @("install") "Failed to install frontend dependencies."
    } finally {
        Pop-Location
    }
}

$BackendPid = Join-Path $PidDir "backend.pid"
$FrontendPid = Join-Path $PidDir "frontend.pid"
Stop-ByPidFile $BackendPid
Stop-ByPidFile $FrontendPid

$BackendCommand = @"
Set-Location '$Root'
`$env:DATABASE_URL='sqlite+aiosqlite:///./instance/local_lab.db'
`$env:FRONTEND_URL='$FrontendUrl'
& '$VenvPython' -m uvicorn backend.main:app --reload --host 127.0.0.1 --port $BackendPort *> '$BackendLog'
"@

$FrontendCommand = @"
Set-Location '$Root\frontend'
`$env:VITE_API_URL='$BackendUrl'
& npm.cmd run dev -- --host 127.0.0.1 --port $FrontendPort *> '$FrontendLog'
"@

$Backend = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $BackendCommand
)
$Backend.Id | Set-Content $BackendPid

$Frontend = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $FrontendCommand
)
$Frontend.Id | Set-Content $FrontendPid

Start-Sleep -Seconds 5

if (-not $NoBrowser) {
    $browser = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if (-not $browser) {
        $browser = Get-Command chrome.exe -ErrorAction SilentlyContinue
    }

    if ($browser) {
        Write-SetupLog "Opening local lab app window"
        $browserProcess = Start-Process $browser.Source -PassThru -ArgumentList @(
            "--app=$FrontendUrl",
            "--user-data-dir=$BrowserProfile",
            "--no-first-run"
        )
        Wait-Process -Id $browserProcess.Id
        Write-SetupLog "App window closed; stopping local lab services"
        Stop-ByPidFile $FrontendPid
        Stop-ByPidFile $BackendPid
    } else {
        Write-SetupLog "Edge/Chrome was not found; opening default browser without auto-stop"
        Start-Process $FrontendUrl
    }
}

Write-SetupLog "Local lab started"
