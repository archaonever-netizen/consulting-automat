# Миграция ШЕФ: Flask → FastAPI + React

## Статус: Этап 0-1 ✅

Завершены **Setup & Scaffold** и основные **CRUD маршруты**.

## Структура проекта

```
d:\consulting-automat\
├── backend/                    # FastAPI backend
│   ├── core/
│   │   ├── config.py          # Настройки (Pydantic BaseSettings)
│   │   ├── database.py        # Async SQLAlchemy, DeclarativeBase
│   │   └── celery_app.py      # Celery broker (Redis)
│   ├── models.py              # SQLAlchemy 2.0 models (22 таблицы)
│   ├── schemas/               # Pydantic schemas (auth, clients, briefs, company, tasks)
│   ├── services/              # Business logic (auth, clients, briefs, company, tasks)
│   ├── routes/                # FastAPI routers (auth, clients, briefs, company, tasks)
│   ├── workers/               # Celery tasks (scaffold)
│   ├── main.py                # FastAPI app with CORS + lifespan
│   └── requirements.txt        # Dependencies
│
├── frontend/                   # React + Vite
│   ├── src/
│   │   ├── App.tsx            # React Router v6 + PrivateRoute
│   │   ├── pages/             # LoginPage, HomePage, ClientsPage, etc.
│   │   ├── components/        # Layout (sidebar)
│   │   ├── services/api.ts    # Axios with JWT interceptors
│   │   └── styles/            # CSS from static/
│   ├── index.html             # Google Fonts + icon
│   ├── .env.local             # VITE_API_URL=http://localhost:8000
│   └── package.json           # React Router, Axios, TypeScript
│
├── instance/
│   └── app.db                 # Existing SQLite dev DB (read-compatible)
│
└── create_test_user.py        # Script to create test user
```

## Запуск локально

### 1. Backend

```powershell
cd d:\consulting-automat\backend
pip install -r requirements.txt
cd d:\consulting-automat
python create_test_user.py         # Создать test@example.com / password123
python -m uvicorn backend.main:app --reload --port 8000
```

Проверка:
- GET `http://localhost:8000/api/health` → `{"status": "ok"}`
- GET `http://localhost:8000/docs` → Swagger UI с всеми endpoints
- POST `http://localhost:8000/api/auth/login` 
  - Body: `{"email":"test@example.com","password":"password123"}`
  - Response: `{"access_token":"...", "token_type":"bearer"}`

### 2. Frontend

```powershell
cd d:\consulting-automat\frontend
npm install  # If not done yet
npm run dev
```

Frontend откроется на `http://localhost:5173`:
- `/login` — форма входа, CSS работает
- После логина → `/` (Home page)
- Навигация: Главная → Клиенты → Компания → Задачи → (Выход)

## API Endpoints

### Auth
- `POST /api/auth/login` — вход (email + password → JWT token)
- `GET /api/auth/me` — текущий пользователь (требует Bearer token)
- `POST /api/auth/logout` — выход (клиент чистит localStorage)

### Clients
- `GET /api/clients` — список клиентов с health-метриками
- `POST /api/clients` — создать клиента
- `GET /api/clients/{id}` — детали клиента
- `PUT /api/clients/{id}` — обновить клиента
- `DELETE /api/clients/{id}` — удалить клиента

### Briefs
- `POST /api/briefs` — создать брифинг
- `GET /api/briefs/{id}` — детали брифинга со всеми секциями
- `DELETE /api/briefs/{id}` — удалить брифинг

### Company (только для is_founder=true)
- `GET /api/company` — функции, отделы, связи с health-метриками
- (В разработке: POST/PATCH/DELETE для функций, отделов, связей)

### Tasks
- `GET /api/tasks` — список задач текущего пользователя
- `POST /api/tasks` — создать задачу
- `GET /api/tasks/{id}` — детали задачи
- `DELETE /api/tasks/{id}` — удалить задачу

## Архитектурные решения

### Database
- **Dev**: SQLite (`instance/app.db`) — использует существующую БД
- **Prod**: PostgreSQL (Supabase) — через env var `DATABASE_URL`
- **ORM**: SQLAlchemy 2.0 async (`sqlalchemy>=2.0.0`)
  - `AsyncSession` с `expire_on_commit=False`
  - `selectinload()` для eager loading (предотвращает `MissingGreenlet`)

### Models
- **Переписаны**: Все 22 модели с использованием `Mapped[type]` и `mapped_column()`
- **Relationships**: Explicit `back_populates` вместо `backref`
- **Partial Indexes**: `User.is_founder` с `postgresql_where` + `sqlite_where`
- **Compatibility**: Существующая БД читается без миграций (DDL-compatible)

### Auth
- **JWT**: `python-jose` с HS256
- **Password**: `werkzeug.security` (совместимо с Flask app)
- **Token Storage**: localStorage (frontend)
- **Interceptors**: Axios добавляет `Authorization: Bearer` автоматически

### Frontend
- **Framework**: React 18 + TypeScript
- **Routing**: React Router v6 (PrivateRoute, NavLink, Outlet)
- **HTTP**: Axios с JWT + 401 redirect
- **CSS**: Скопирован из `static/css/styles.css`, импортируется в App.tsx
- **Build**: Vite (TypeScript, JSX, CSS preprocessing)

## Что ещё нужно (Этап 1 продолжение)

- [ ] Полная верстка React Pages (ClientsPage, BriefForm, CompanyMatrix, TasksList)
- [ ] Briefs endpoints для работы с секциями (PUT, POST autosave)
- [ ] Company endpoints для CRUD функций/отделов/связей
- [ ] Tasks endpoints для start/complete/patch
- [ ] Интеграция с Яндекс.Календарь (scaffold в UserTask.calendar_event_uid)
- [ ] AI Chat (Этап 3 — LangChain streaming)
- [ ] Celery workers для фоновых анализов (Этап 2)

## Тестирование

### Backend tests
```powershell
pip install pytest pytest-asyncio httpx
pytest backend/tests/ -v
```

### Frontend tests
```powershell
npm install --save-dev vitest @testing-library/react
npm run test
```

### E2E tests (Playwright)
```powershell
npm install --save-dev @playwright/test
npx playwright test
```

## Deployment

### Backend (Uvicorn + Gunicorn)
```bash
pip install gunicorn
gunicorn backend.main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker
```

### Frontend (Vercel / Netlify)
```bash
npm run build  # Создает dist/
# Deploy dist/ to Vercel/Netlify
```

### Database (Supabase)
1. Создать проект на supabase.com
2. Скопировать DATABASE_URL
3. Установить env var: `DATABASE_URL=postgresql://...`

## Используемые пакеты

### Backend
- `fastapi` (0.115.0) — веб-фреймворк
- `sqlalchemy` (2.0+) — async ORM
- `asyncpg` — PostgreSQL driver для async
- `aiosqlite` — SQLite driver для async
- `python-jose` — JWT токены
- `passlib` + `werkzeug` — password hashing
- `celery` — фоновые задачи (scaffold)
- `redis` — message broker
- `pydantic-settings` — env vars
- `openai` — LLM API client

### Frontend
- `react` (18+) — UI library
- `react-router-dom` (6+) — routing
- `axios` — HTTP client
- `typescript` — type safety
- `vite` — build tool

## Документация

- [План миграции](C:\Users\Arch\.claude\plans\flask-snug-robin.md)
- [Таблица маршрутов](http://localhost:8000/docs) (Swagger UI)

## Контакт

Для вопросов — см. план миграции или смотрите памяти проекта в `.claude/projects/d--consulting-automat/memory/`
