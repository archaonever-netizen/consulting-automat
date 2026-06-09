# Быстрый старт — Миграция ШЕФ

## За 5 минут до рабочего приложения

### 1️⃣ Тестовый пользователь

```powershell
cd d:\consulting-automat
python create_test_user.py
# ✓ Created user: test@example.com / password123
```

### 2️⃣ Backend (Terminal 1)

```powershell
cd d:\consulting-automat\backend
pip install -r requirements.txt  # Одноразово
cd ..
python -m uvicorn backend.main:app --reload --port 8000
```

✅ Backend готов на `http://localhost:8000/api/health`

### 3️⃣ Frontend (Terminal 2)

```powershell
cd d:\consulting-automat\frontend
npm install  # Одноразово
npm run dev
```

✅ Frontend откроется на `http://localhost:5173`

### 4️⃣ Тест в браузере

1. **Откройте** `http://localhost:5173`
   - Перенаправит на `/login` (CSS работает!)
   
2. **Введите**:
   - Email: `test@example.com`
   - Password: `password123`
   - Нажмите "Вход"

3. **Проверьте**:
   - ✅ Редирект на Home (`/`)
   - ✅ Сайдбар с логотипом ШЕФ и меню
   - ✅ Ссылка на пользователя + кнопка выхода
   - ✅ Клик на "Клиенты" → `/clients` (загружает список из API)
   - ✅ Клик на "Задачи" → `/tasks` (загружает задачи из API)

## Что работает ✅

| Функция | Статус |
|---------|--------|
| **Auth** | ✅ JWT login/logout |
| **Clients CRUD** | ✅ GET list, POST create, GET detail |
| **API Docs** | ✅ Swagger на `/docs` |
| **CSS** | ✅ Все переменные `--bg`, `--accent` видны |
| **Database** | ✅ Читает существующую `instance/app.db` |
| **React Router** | ✅ PrivateRoute, NavLink, Outlet |
| **Axios** | ✅ JWT interceptor, 401 redirect |

## Что в разработке 🚧

- [ ] Полная верстка ClientsPage (grid, картточки)
- [ ] BriefForm с секциями
- [ ] CompanyMatrix с функциями/отделами
- [ ] TasksList с фильтрацией
- [ ] AI Chat integration

## Troubleshooting

### ❌ Backend: `Python not found`
```powershell
# Проверь путь
python --version
# Если не работает, используй full path
C:\Users\Arch\AppData\Local\Microsoft\WindowsApps\python.exe -m uvicorn backend.main:app --reload
```

### ❌ Frontend: `Module not found`
```powershell
cd frontend
npm install
npm run dev
```

### ❌ Database: `No such table`
```powershell
python create_test_user.py  # Создаст таблицы автоматически
```

### ❌ CORS error: `Access-Control-Allow-Origin`
- Backend должен работать на `http://localhost:8000`
- Frontend должен работать на `http://localhost:5173`
- Проверь `.env.local` в frontend: `VITE_API_URL=http://localhost:8000`

### ❌ 401 Unauthorized при логине
- Убедись, что пользователь создан: `python create_test_user.py`
- Проверь email и пароль: `test@example.com` / `password123`
- Проверь консоль backend на ошибки (logging)

## API Quick Test

### Здоровье системы
```bash
curl http://localhost:8000/api/health
# {"status":"ok"}
```

### Логин
```bash
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
# {"access_token":"...","token_type":"bearer"}
```

### Клиенты (с токеном)
```bash
TOKEN="<access_token>"
curl http://localhost:8000/api/clients \
  -H "Authorization: Bearer $TOKEN"
# [{...}, {...}]
```

## Файлы для запоминания 📝

- `backend/main.py` — FastAPI app
- `backend/models.py` — SQLAlchemy models
- `backend/routes/*.py` — endpoints
- `backend/services/*.py` — business logic
- `frontend/src/App.tsx` — React Router
- `frontend/src/services/api.ts` — Axios config
- `frontend/.env.local` — API URL

## Next Steps

👉 Прочитай план: `C:\Users\Arch\.claude\plans\flask-snug-robin.md`
👉 Запусти оба сервера и проверь в браузере
👉 Добавь больше endpoints или улучши UI по необходимости
