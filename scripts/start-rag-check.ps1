# Запуск приложения для ЖИВОЙ проверки RAG (ИИ-Сотрудники / Методолог).
#
# Отличие от start-local-lab.ps1: НЕ задаёт свою SQLite-базу. База берётся из
# .env.local — там должен быть РАСКОММЕНТИРОВАН Postgres (Supabase), где живёт RAG.
# Бэкенд сам отдаёт собранный фронт (frontend/dist), отдельный Vite не нужен.
# На первом старте бот-таблицы засидятся в Postgres идемпотентно.
#
# Это разовый проверочный запуск против боевой Postgres-базы — не для
# повседневной разработки (для неё остаётся обычный ярлык «SHEF Local Lab»).

param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Logs = Join-Path $Root "logs"
$PidDir = Join-Path $Root ".local-lab"
$BrowserProfile = Join-Path $PidDir "browser-profile"
$VenvPython = Join-Path $Root ".venv\Scripts\python.exe"
$EnvFile = Join-Path $Root ".env.local"
$Dist = Join-Path $Root "frontend\dist\index.html"
$BackendPort = 8000
$BackendUrl = "http://127.0.0.1:$BackendPort"
$BackendLog = Join-Path $Logs "rag-check-backend.log"
$BackendPid = Join-Path $PidDir "rag-check-backend.pid"

New-Item -ItemType Directory -Force -Path $Logs | Out-Null
New-Item -ItemType Directory -Force -Path $PidDir | Out-Null
New-Item -ItemType Directory -Force -Path $BrowserProfile | Out-Null

# --- Проверки перед запуском ---
if (-not (Test-Path $VenvPython)) {
    throw "Не найдено окружение .venv. Сначала один раз запустите обычный ярлык «SHEF Local Lab», чтобы оно создалось."
}
if (-not (Test-Path $Dist)) {
    throw "Не найден собранный фронт ($Dist). Соберите его: в папке frontend выполните  `$env:VITE_API_URL=''; npx vite build"
}
if (-not (Test-Path $EnvFile)) {
    throw "Не найден .env.local."
}

# В .env.local должна быть АКТИВНАЯ (не закомментированная) строка DATABASE_URL с postgres.
$dbLine = Select-String -Path $EnvFile -Pattern '^\s*DATABASE_URL\s*=\s*\S*postgres' -ErrorAction SilentlyContinue
if (-not $dbLine) {
    Write-Host ""
    Write-Host "ОСТАНОВКА: в .env.local нет активной строки DATABASE_URL с Postgres." -ForegroundColor Yellow
    Write-Host "Откройте .env.local и РАСКОММЕНТИРУЙТЕ строку Supabase, например:" -ForegroundColor Yellow
    Write-Host "  DATABASE_URL=postgresql+asyncpg://...supabase..." -ForegroundColor Yellow
    Write-Host "Затем снова запустите эту проверку." -ForegroundColor Yellow
    Write-Host ""
    throw "DATABASE_URL=Postgres не задан в .env.local."
}

# Останавливаем прошлый проверочный бэкенд, если висит.
if (Test-Path $BackendPid) {
    $old = Get-Content $BackendPid -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) { Stop-Process -Id $old -Force }
    Remove-Item $BackendPid -Force -ErrorAction SilentlyContinue
}

# ВАЖНО: $env:DATABASE_URL НЕ задаём — pydantic возьмёт Postgres из .env.local.
$BackendCommand = @"
Set-Location '$Root'
`$env:FRONTEND_URL='$BackendUrl'
& '$VenvPython' -m uvicorn backend.main:app --host 127.0.0.1 --port $BackendPort *> '$BackendLog'
"@

$Backend = Start-Process powershell.exe -WindowStyle Hidden -PassThru -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $BackendCommand
)
$Backend.Id | Set-Content $BackendPid

Write-Host "Запуск проверочного бэкенда против Postgres из .env.local..." -ForegroundColor Cyan
Write-Host "Логи: $BackendLog" -ForegroundColor DarkGray

# Ждём готовности: первый старт против Supabase (create_all + миграции + сиды по
# сети) может занять до минуты. Открываем браузер только когда /api/health отвечает.
Write-Host "Ожидаю готовности приложения (до ~90 сек на первом старте)..." -ForegroundColor DarkGray
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 3
    try {
        $h = Invoke-WebRequest -Uri "$BackendUrl/api/health" -UseBasicParsing -TimeoutSec 4
        if ($h.StatusCode -eq 200) { $ready = $true; break }
    } catch { }
}
if ($ready) {
    Write-Host "Приложение готово: $BackendUrl" -ForegroundColor Green
} else {
    Write-Host "Приложение не ответило вовремя — проверьте лог: $BackendLog" -ForegroundColor Yellow
}

if (-not $NoBrowser) {
    $browser = Get-Command msedge.exe -ErrorAction SilentlyContinue
    if (-not $browser) { $browser = Get-Command chrome.exe -ErrorAction SilentlyContinue }
    if ($browser) {
        $win = Start-Process $browser.Source -PassThru -ArgumentList @(
            "--app=$BackendUrl", "--user-data-dir=$BrowserProfile", "--no-first-run"
        )
        Wait-Process -Id $win.Id
        # Окно закрыли — гасим бэкенд.
        if (Test-Path $BackendPid) {
            $b = Get-Content $BackendPid -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($b -and (Get-Process -Id $b -ErrorAction SilentlyContinue)) { Stop-Process -Id $b -Force }
            Remove-Item $BackendPid -Force -ErrorAction SilentlyContinue
        }
    } else {
        Start-Process $BackendUrl
        Write-Host "Открыл $BackendUrl в браузере по умолчанию. Бэкенд остаётся работать." -ForegroundColor Cyan
    }
}
