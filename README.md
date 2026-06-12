# ШЕФ — consulting-automat

Веб-приложение для автоматизации консалтинга: клиенты и брифы, структура компании,
цели с ИИ-декомпозицией, задачи, ИИ-чат и сеть агентов, трекер Kaiten, база знаний.

**Стек:** FastAPI (Python 3.12) + React 19/TypeScript (Vite) + SQLite. Деплой — Amvera (Docker).

## Запуск локально

Нужны: Python 3.12, Node.js. Откройте два терминала.

**Терминал 1 — бэкенд:**
```powershell
cd d:\consulting-automat
.venv\Scripts\pip install -r backend\requirements.txt   # первый раз
.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000
```
Старт занимает ~10 секунд (создаются таблицы, сидится основатель и база знаний).
Проверка: http://localhost:8000/api/health → `{"status":"ok"}`.

**Терминал 2 — фронтенд:**
```powershell
cd d:\consulting-automat\frontend
npm install        # первый раз
npm run dev
```
Открыть http://localhost:5173.

**Логин:** основатель создаётся автоматически из `FOUNDER_EMAIL` / `FOUNDER_PASSWORD`
в `.env.local`. Тестовый пользователь: `python create_test_user.py`
(test@example.com / password123).

## Полезные адреса

- Приложение (дев): http://localhost:5173
- API-документация (Swagger): http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

## Если что-то не работает

- **CORS-ошибка** — бэкенд должен быть на :8000, фронт на :5173.
- **401 при логине** — создайте пользователя (`python create_test_user.py`) и проверьте пароль.
- **No such table** — запустите бэкенд один раз: таблицы создаются на старте.
- **Порт занят** — запустите на другом: `--port 8001` (и поправьте `VITE_API_URL`).

## Деплой (Amvera)

Прод-артефакт фронтенда — папка `frontend/dist`, она **коммитится в репозиторий**.
Перед коммитом изменений фронтенда обязательно пересобрать:
```powershell
cd frontend
npm run build     # VITE_API_URL должен быть ПУСТЫМ (см. .env.production)
```
и проверить, что в `dist/assets/*.js` не зашит `localhost:8000`.
Деплой — push в выделенный git-репозиторий Amvera (ветка master).

## Документация

| Файл | Что внутри |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | как устроено приложение (понятным языком) |
| [docs/NOTES.md](docs/NOTES.md) | заметки, идеи, бэклог, история проекта |
| [docs/REVIEW_LOG.md](docs/REVIEW_LOG.md) | журнал ревью и улучшений (06.2026) |
| [README_MIGRATION.md](README_MIGRATION.md) | детали миграции Flask→FastAPI, список API |
| [ARCHITECTURE_AGENTS.md](ARCHITECTURE_AGENTS.md) | сеть ИИ-агентов (LangGraph) |
| [decompsition/](decompsition/) | фреймворк декомпозиции целей (спека + промпты) |
