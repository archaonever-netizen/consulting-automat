# 🚀 Запуск приложения в VS Code

## Шаг 1: Откройте 2 терминала в VS Code

`Ctrl+Shift+` (backtick) → открыть терминал
`Ctrl+Shift+` ещё раз → открыть второй терминал (split)

---

## Шаг 2: Создать тестового пользователя

**В ЛЮБОМ терминале:**
```powershell
cd d:\consulting-automat
python create_test_user.py
```

**Ожидаемый результат:**
```
✓ Created user: test@example.com / password123
```

---

## Шаг 3: Запустить BACKEND (Терминал 1)

```powershell
cd d:\consulting-automat\backend
pip install -r requirements.txt
cd ..
python -m uvicorn backend.main:app --reload --port 8000
```

**Ожидаемый результат:**
```
INFO:     Uvicorn running on http://127.0.0.1:8000
Press CTRL+C to quit
```

✅ Backend готов на `http://localhost:8000`

---

## Шаг 4: Запустить FRONTEND (Терминал 2)

```powershell
cd d:\consulting-automat\frontend
npm install
npm run dev
```

**Ожидаемый результат:**
```
  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

✅ Frontend готов на `http://localhost:5173`

---

## Шаг 5: Открыть в браузере

**Кликни на ссылку в терминале:**
```
http://localhost:5173
```

Или вручную введи адрес в браузер.

---

## 🔐 Логин

```
Email:    test@example.com
Password: password123
```

---

## 📍 Что откроется

1. **Форма входа** (красивая, с CSS переменными)
2. Вводишь email + пароль
3. **Редирект на Home** (приветствие + дата)
4. **Сайдбар** с навигацией:
   - 🏠 Главная
   - 👥 Клиенты ← **НОВОЕ с health ring + avatar**
   - 🏢 Компания
   - ✅ Задачи ← **НОВОЕ со split-panel**
   - ⎋ Выход

---

## 🔗 Полезные ссылки

- **API Docs**: http://localhost:8000/docs (Swagger)
- **Health Check**: http://localhost:8000/api/health
- **Clients API**: http://localhost:8000/api/clients (GET)

---

## ⚠️ Если что-то не работает

### Python не найден
```powershell
# Используй полный путь
C:\Users\Arch\AppData\Local\Microsoft\WindowsApps\python.exe create_test_user.py
```

### npm не найден
```powershell
# Установи Node.js с nodejs.org
# Потом перезагрузи PowerShell
```

### Port 8000 уже занят
```powershell
# Используй другой port:
python -m uvicorn backend.main:app --reload --port 8001
```

### Port 5173 уже занят
```powershell
# Vite сам выберет другой port, не переживай
```

---

## 📚 Документация

- `README_MIGRATION.md` — архитектура всего проекта
- `QUICKSTART.md` — быстрый старт
- `DONE.md` — что реализовано
- `PLAN_COMPLETION.md` — отчёт выполнения плана

---

## 🎉 Готово!

Приложение готово к локальному тестированию! 

Все изменения в коде **автоматически перезагружаются** (hot reload) благодаря:
- Backend: `--reload` flag в Uvicorn
- Frontend: HMR (Hot Module Replacement) в Vite

**Просто редактируй код и смотри результат в браузере!** 🚀
