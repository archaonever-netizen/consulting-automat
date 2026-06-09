# Start ШЕФ locally

Write-Host "🚀 Запуск ШЕФ..." -ForegroundColor Green

# Check if test user needs to be created
Write-Host "`n1️⃣ Создание тестового пользователя..." -ForegroundColor Cyan
$python = "python"
& $python create_test_user.py

Write-Host "`n2️⃣ Инструкции:" -ForegroundColor Cyan
Write-Host "
  BACKEND (Terminal 1):
  cd d:\consulting-automat\backend
  pip install -r requirements.txt  (первый раз)
  cd ..
  python -m uvicorn backend.main:app --reload --port 8000

  FRONTEND (Terminal 2):
  cd d:\consulting-automat\frontend
  npm install  (первый раз)
  npm run dev

  БРАУЗЕР:
  http://localhost:5173

  ЛОГИН:
  Email: test@example.com
  Password: password123
" -ForegroundColor Yellow

Write-Host "`n3️⃣ Нажми ENTER когда готов к запуску backend..."
Read-Host
