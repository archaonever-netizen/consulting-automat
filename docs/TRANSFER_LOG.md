# Журнал переноса изменений

Этот файл нужен, чтобы любые изменения из lab-веток можно было понятно перенести в основной репозиторий. Формат рассчитан и на человека, и на ИИ: заголовки стабильные, факты отделены от заметок, команды тестов указаны явно.

## Инструкция по заполнению

Для каждого нового блока изменений добавляй отдельный раздел по шаблону ниже. Не смешивай несколько крупных задач в один блок, если они могут переноситься независимо.

### Шаблон блока

```md
## Блок N. Краткое название

### Контекст
- Репозиторий:
- Ветка:
- Дата:
- Цель:
- Ограничения:

### Функционал, который разрабатывался
- Что планировалось сделать:
- Для кого/чего это нужно:
- Какая пользовательская команда или сценарий должны работать:

### Фактический функционал
- Что реально реализовано:
- Что работает локально:
- Что требует внешних настроек:
- Что пока не реализовано:

### Изменения, которые были произведены
- Backend:
- Frontend:
- База данных/модели:
- Конфигурация:
- Скрипты/локальный запуск:
- Документация:
- Сборочные артефакты:

### Результаты тестов
- Команда:
- Результат:
- Предупреждения:

### Найденные ошибки и устранение
- Ошибка:
- Причина:
- Исправление:
- Как проверено:

### Измененные файлы
- `path/to/file` - что изменено и зачем.

### Заметки для переноса в основной репозиторий
- Что переносить обязательно:
- Что переносить осторожно:
- Что можно не переносить:
- Риски:
- Следующие шаги:
```

Правила заполнения:
- Пиши фактическое состояние, а не намерения.
- Указывай точные команды тестов и их итог.
- Если файл является сгенерированным артефактом, помечай это явно.
- Если изменение зависит от `.env`, указывай переменные.
- Если есть временные локальные файлы, отделяй их от переносимых изменений.
- Для ошибок фиксируй не только симптом, но и причину и конкретное исправление.

## Блок 1. Локальное ядро Telegram-секретаря

### Контекст

- Репозиторий: `D:\consulting-automat-lab`
- Ветка: `telegram-secretary-local-core`
- Дата работ: 2026-06-12 - 2026-06-13
- Цель: заложить локальное ядро Telegram-секретаря, проверить прием/отправку сообщений, связать это с задачами и AI-чатами.
- Ограничения: работа ведется в lab-репозитории, без пуша в основную ветку. Локальный запуск через ярлык и dev-серверы.

### Функционал, который разрабатывался

- Локальный Telegram-секретарь, подключенный к текущему приложению.
- Прием входящих Telegram webhook-сообщений.
- Отправка исходящих Telegram-сообщений через bot token.
- Локальная консоль секретаря внутри приложения.
- Команды секретаря:
  - создать задачу;
  - показать список задач карточками;
  - отправить сообщение в Telegram;
  - создать Telegram-чат в разделе `ИИ-Чаты`.
- Карточки задач в ответах секретаря: компактный UI, переход в задачу, отображение времени до начала и подготовки/заметок.
- Поле задачи `Подготовка и заметки`.
- Telegram-чаты в `ИИ-Чаты` должны быть транспортными чатами: сообщение из такого чата отправляется через бота, а не отправляется в LLM.

### Фактический функционал

- Добавлен backend-модуль секретаря:
  - локальный endpoint для проверки команд;
  - Telegram webhook endpoint;
  - endpoint ручной отправки Telegram-сообщения;
  - парсер базовых команд.
- Добавлена страница `Telegram-секретарь` во frontend.
- Добавлена команда отправки:
  - `отправь сообщение Я на связи, отвечу чуть позже`
- Добавлена команда создания Telegram-чата:
  - `создать чат 123456`
  - `создать чат 123456 @client_user`
  - `создать чат 123456 @client_user Иван Петров`
- Telegram-чат создается в `ИИ-Чаты`, левая колонка `Чаты`, с меткой `TG`.
- Заголовок Telegram-чата синхронизируется так:
  - если есть Telegram username, показывается `@username`;
  - иначе если есть Telegram-имя, показывается имя;
  - иначе показывается `Telegram ID <id>`.
- Повторное создание чата для того же Telegram user обновляет метаданные, а не создает дубль.
- В Telegram-чате отправка сообщения идет через Telegram Bot API. LLM-ответ не запускается.
- Для обычных AI-чатов и подчатов задач поведение LLM осталось прежним.
- Для задач добавлено необязательное поле `preparation_notes`.
- Ответ `список задач` возвращает структурированные карточки задач.
- Карточка задачи показывает:
  - название;
  - сколько осталось до начала;
  - подготовку/заметки, если поле заполнено;
  - переход к задаче.

Что требует внешних настроек:
- `TELEGRAM_BOT_TOKEN` - токен Telegram-бота.
- `TELEGRAM_WEBHOOK_SECRET` - секрет для webhook, если используется.
- `SECRETARY_OWNER_TELEGRAM_ID` - Telegram ID владельца/адресата по умолчанию.
- `SECRETARY_LOCAL_USER_EMAIL` - локальный пользователь, от имени которого работает секретарь.

Что пока не реализовано:
- Автоматическое создание Telegram-чата прямо из входящего webhook для каждого нового внешнего пользователя.
- Полноценный outbox/retry-механизм для доставки Telegram-сообщений.
- Интеграция MAX.
- Планировщик цикличных задач и напоминаний.
- Боевой механизм миграций через Alembic. Сейчас добавлены idempotent `ALTER TABLE`-проверки на старте приложения.

### Изменения, которые были произведены

#### Backend

- Добавлены новые схемы секретаря:
  - `LocalSecretaryMessage`
  - `TelegramSendMessage`
  - `SecretaryAction`
  - `SecretaryTaskCard`
  - `SecretaryResponse`
- Добавлен парсер команд секретаря.
- Добавлена бизнес-логика:
  - создание личных задач;
  - список задач карточками;
  - отправка Telegram-сообщения;
  - создание Telegram-чата;
  - определение локального пользователя секретаря.
- Добавлен Telegram-адаптер:
  - извлечение `chat_id`, `user_id`, текста из update;
  - проверка владельца;
  - отправка ответа через Telegram Bot API.
- Добавлены маршруты:
  - `POST /api/secretary/local/message`
  - `POST /api/secretary/telegram/webhook`
  - `POST /api/secretary/telegram/send`
  - `POST /api/chat/session/telegram-chats`
- Изменен `POST /api/chat/subchats/{subchat_id}/send`:
  - для `source = telegram` сообщение отправляется через Telegram Bot API;
  - LLM не вызывается;
  - в историю сохраняется только исходящее user-сообщение;
  - возвращается SSE-событие `sent`.

#### Frontend

- Добавлена страница `SecretaryPage`.
- Добавлен маршрут `/secretary`.
- Добавлен пункт меню для секретаря.
- На странице секретаря доступны режимы локальной команды и Telegram-отправки.
- Добавлены быстрые команды, включая `создать чат 123456 @client_user`.
- Ответы со списком задач отображаются компактными карточками.
- Карточки задач ведут на страницу задач с выбранной задачей.
- Страница задач поддерживает поле `Подготовка и заметки`.
- Страница `ИИ-Чаты`:
  - показывает Telegram-чаты в левой колонке `Чаты`;
  - отделяет их от подчатов задач;
  - помечает их `TG`;
  - не рисует пустой assistant bubble при отправке в Telegram-чат;
  - показывает ошибку отправки в Telegram, а не ошибку соединения с ИИ.

#### База данных/модели

- `UserTask`:
  - добавлено поле `preparation_notes`.
- `UserSubChat`:
  - добавлено поле `title`;
  - добавлено поле `source`;
  - добавлено поле `telegram_chat_id`;
  - добавлено поле `telegram_user_id`;
  - добавлено поле `telegram_username`;
  - добавлено поле `telegram_full_name`.
- В `backend/main.py` добавлены idempotent startup-проверки:
  - `_ensure_task_columns`;
  - `_ensure_subchat_columns`.

#### Конфигурация

- Добавлены настройки:
  - `telegram_bot_token`;
  - `telegram_webhook_secret`;
  - `secretary_owner_telegram_id`;
  - `secretary_local_user_email`.
- `.env.example` дополнен Telegram-настройками.
- Исправлено чтение founder-настроек через Pydantic `settings`, а не напрямую через `os.getenv`.

#### Скрипты/локальный запуск

- Добавлены/обновлены локальные lab-скрипты:
  - `scripts/start-local-lab.ps1`
  - `scripts/stop-local-lab.ps1`
  - `scripts/create-local-lab-shortcut.ps1`
- Локальный backend порт: `8010`.
- Локальный frontend порт: `5174`.
- Локальная база: `instance/local_lab.db`.
- Служебные локальные папки:
  - `.local-lab/`
  - `logs/`

Эти служебные папки нужны для локального запуска, но обычно не должны переноситься в основной репозиторий как код приложения.

#### Документация

- Добавлен `docs/TELEGRAM_SECRETARY_ARCHITECTURE.md`.
- Добавлен этот файл: `docs/TRANSFER_LOG_TELEGRAM_SECRETARY.md`.

#### Сборочные артефакты

- `npm.cmd run build` обновил `frontend/dist`.
- В `frontend/dist/assets` удалены старые hash-файлы и созданы новые.
- При переносе в основной репозиторий нужно решить, хранятся ли `frontend/dist`-артефакты в git в основной ветке. Если да - переносить новые hash-файлы и удаления старых. Если нет - не переносить `dist`.

### Результаты тестов

#### Backend tests

Команда:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests\test_secretary_core.py backend\tests\test_tasks_service.py
```

Результат:

```text
13 passed
```

Предупреждения:
- `datetime.datetime.utcnow()` deprecated warning от SQLAlchemy/model defaults.
- `python_multipart` pending deprecation warning от Starlette.

#### Секретарь после правки Telegram-чата

Команда:

```powershell
.\.venv\Scripts\python.exe -m pytest backend\tests\test_secretary_core.py
```

Результат:

```text
10 passed
```

#### Ruff

Команда:

```powershell
.\.venv\Scripts\python.exe -m ruff check backend\services\chat_service.py backend\tests\test_secretary_core.py
```

Результат:

```text
All checks passed!
```

Также ранее проверялись измененные Python-файлы секретаря, чата и схем:

```powershell
.\.venv\Scripts\python.exe -m ruff check backend\schemas\chat.py backend\schemas\secretary.py backend\services\chat_service.py backend\services\secretary_core.py backend\routes\chat.py backend\routes\secretary.py backend\tests\test_secretary_core.py
```

Результат:

```text
All checks passed!
```

#### Frontend build

Команда:

```powershell
npm.cmd run build
```

Рабочая директория:

```text
D:\consulting-automat-lab\frontend
```

Результат:

```text
tsc -b && vite build
✓ built
```

#### Frontend task logic tests

Команда:

```powershell
npm.cmd run test -- src/pages/tasks/logic.test.ts
```

Результат:

```text
8 passed
```

### Найденные ошибки и устранение

#### 1. Founder seed не подхватывал настройки

- Ошибка: локальный пользователь/основатель мог не обновляться при смене env-настроек.
- Причина: seed использовал `os.getenv`, при этом приложение уже работало через Pydantic `Settings`.
- Исправление: `_seed_founder` переведен на `settings.founder_email`, `settings.founder_password`, `settings.founder_name`.
- Как проверено: локальный вход и тестовый пользователь были проверены в lab-среде.

#### 2. Существующая SQLite-база не получала новые поля

- Ошибка: `create_all` не добавляет новые колонки в уже существующие таблицы.
- Причина: для локальной SQLite не было миграционного слоя.
- Исправление: добавлены startup-функции `_ensure_task_columns` и `_ensure_subchat_columns`.
- Как проверено: backend-тесты на in-memory SQLite и запуск приложения через reload.

#### 3. Список задач сначала возвращался только текстом

- Ошибка: секретарь присылал список задач как обычный текст.
- Причина: API-ответ не содержал структурированных карточек.
- Исправление: добавлен `SecretaryTaskCard`, frontend отображает карточки.
- Как проверено: `test_secretary_creates_and_lists_task_cards`, frontend build.

#### 4. В карточке задачи показывалась длительность вместо времени до начала

- Ошибка: UI показывал время выполнения задачи, а требовалось "сколько осталось до начала".
- Причина: карточка использовала `duration_minutes`.
- Исправление: карточка теперь считает countdown от `start_time`.
- Как проверено: frontend build и визуальная проверка UI пользователем.

#### 5. Команда "Отправить сообщение" не была связана с Telegram Bot API

- Ошибка: секретарь мог распознать намерение, но требовалась реальная отправка.
- Причина: действие не исполнялось на уровне route.
- Исправление: `local_message` при `send_telegram` вызывает `send_telegram_message`.
- Как проверено: backend tests и ruff.

#### 6. Telegram-чат создавался как обычный AI-подчат

- Ошибка: созданный чат в `ИИ-Чаты` не отличался по поведению от AI-чата.
- Причина: `UserSubChat` не имел источника и Telegram-метаданных.
- Исправление: добавлены `source`, `telegram_*` поля и отдельный creation/update helper.
- Как проверено: тест `test_create_or_update_telegram_subchat_syncs_title`.

#### 7. Сообщение из Telegram-чата пыталось получить ответ ИИ

- Ошибка: при написании сообщения в созданном Telegram-чате запускался LLM.
- Причина: общий endpoint `/api/chat/subchats/{id}/send` всегда шел в `stream_response` и генерировал AI-ответ.
- Исправление:
  - в `stream_response` добавлена отдельная ветка для `subchat.source == 'telegram'`;
  - сообщение сохраняется как user-сообщение;
  - вызывается `send_telegram_message`;
  - возвращается SSE `sent`;
  - LLM не вызывается;
  - frontend не создает пустой assistant bubble для Telegram-чата.
- Как проверено: тест `test_telegram_subchat_send_uses_bot_without_ai_response`, frontend build.

#### 8. Ruff: длинная строка в SSE-событии

- Ошибка: `E501 Line too long`.
- Причина: длинный inline `json.dumps`.
- Исправление: событие вынесено в `sent_event`.
- Как проверено: `ruff check` -> `All checks passed!`.

### Измененные файлы

#### Backend

- `.env.example` - добавлены Telegram/secretary env-переменные.
- `backend/core/config.py` - добавлены настройки Telegram-секретаря.
- `backend/main.py` - подключен router секретаря, добавлены idempotent проверки колонок, исправлен founder seed.
- `backend/models.py` - добавлены `preparation_notes` у задач и Telegram-метаданные у `UserSubChat`.
- `backend/routes/chat.py` - добавлен endpoint создания Telegram-чата.
- `backend/routes/secretary.py` - добавлены endpoints секретаря и исполнение команд отправки/создания чата.
- `backend/schemas/chat.py` - добавлены поля Telegram-чата и схема `TelegramChatCreate`.
- `backend/schemas/secretary.py` - добавлены схемы секретаря, action-поля для Telegram.
- `backend/schemas/tasks.py` - добавлено поле `preparation_notes`.
- `backend/services/chat_service.py` - добавлено создание/обновление Telegram-чата, заголовки, транспортная отправка через Telegram без LLM.
- `backend/services/secretary_core.py` - добавлен парсер команд и логика ответов секретаря.
- `backend/services/telegram_secretary.py` - добавлен Telegram webhook/send adapter.
- `backend/services/tasks.py` - поддержка `preparation_notes`.
- `backend/tests/test_secretary_core.py` - тесты секретаря, создания Telegram-чата, отправки без LLM.
- `backend/tests/test_tasks_service.py` - использовался в регрессионных проверках задач.
- `create_test_user.py` - исправлен тестовый пользователь и вывод для Windows.

#### Frontend

- `frontend/src/App.tsx` - добавлен маршрут секретаря.
- `frontend/src/components/Layout.tsx` - добавлен пункт меню.
- `frontend/src/pages/SecretaryPage.tsx` - новая страница секретаря.
- `frontend/src/pages/ChatPage.tsx` - отображение Telegram-чатов и отправка через транспортную ветку.
- `frontend/src/pages/TasksPage.tsx` - поле `Подготовка и заметки`, выбор задачи через query.
- `frontend/src/pages/tasks/logic.ts` - поддержка нового поля задач.
- `frontend/src/pages/tasks/logic.test.ts` - тесты логики задач.
- `frontend/src/services/api.ts` - инвалидация задач для secretary endpoints.
- `frontend/dist/index.html` и `frontend/dist/assets/*` - сгенерированные build-артефакты.

#### Локальный запуск и документация

- `docs/TELEGRAM_SECRETARY_ARCHITECTURE.md` - архитектура секретаря.
- `docs/TRANSFER_LOG_TELEGRAM_SECRETARY.md` - этот журнал переноса.
- `scripts/start-local-lab.ps1` - запуск lab backend/frontend на локальных портах.
- `scripts/stop-local-lab.ps1` - остановка lab-процессов.
- `scripts/create-local-lab-shortcut.ps1` - создание ярлыка.
- `.local-lab/` - локальные pid/browser-profile данные, не переносить как код.
- `logs/` - локальные логи, не переносить как код.

### Заметки для переноса в основной репозиторий

Что переносить обязательно:
- Backend router/schema/service секретаря.
- Telegram adapter.
- Изменения `UserTask` и `UserSubChat`.
- Startup-проверки колонок или полноценные Alembic migrations.
- Frontend `SecretaryPage`.
- Изменения `ChatPage` для Telegram-чата.
- Изменения задач для `preparation_notes`.
- Тесты `backend/tests/test_secretary_core.py`.

Что переносить осторожно:
- `backend/main.py`: в основном репозитории может отличаться router list, seed logic и миграционный подход.
- `frontend/dist`: переносить только если основной репозиторий хранит собранный frontend.
- `create_test_user.py`: переносить только если такой тестовый пользователь нужен в основном окружении.
- Локальные PowerShell-скрипты: они завязаны на lab-порты `8010` и `5174`.

Что можно не переносить:
- `.local-lab/`
- `logs/`
- временные pid/browser-profile файлы.

Риски:
- В production лучше заменить startup `ALTER TABLE` на Alembic migrations.
- Сейчас Telegram webhook обрабатывает владельца/локального секретаря, но не создает автоматически чат для каждого нового внешнего пользователя.
- Нет retry/outbox для Telegram-сообщений: если Bot API недоступен, сообщение сохраняется локально, но повторная отправка не запланирована.
- `send_telegram_message` использует Bot API напрямую; для высоких нагрузок нужен rate limiting/outbox.
- Нужно проверить политику доступа: кто в основном приложении имеет право создавать Telegram-чаты и отправлять сообщения.

Следующие шаги:
- Добавить автоматическое создание/обновление Telegram-чата из входящего webhook.
- Сохранять входящие Telegram-сообщения в соответствующий Telegram-чат.
- Добавить outbox и статусы доставки.
- Добавить настройки Telegram в UI администратора.
- Подключить MAX как второй транспорт поверх того же secretary core.
- Добавить планировщик повторяющихся задач и напоминания.

---

## Проектирование / Проекты

### Что разрабатывалось

Добавлен новый раздел приложения "Проекты" для управления проектами, каждый из которых строго привязан к одному клиенту.

### Что фактически реализовано

- Добавлена backend-модель `Project` с обязательным `client_id`.
- Добавлены REST endpoints `/api/projects`:
  - список всех проектов;
  - фильтрация по `client_id`;
  - создание проекта;
  - получение проекта;
  - обновление;
  - удаление.
- Добавлен раздел "Проекты" в навигацию frontend.
- Добавлена страница списка проектов с карточками, поиском, empty/loading/error states и созданием проекта.
- Добавлена форма создания проекта с обязательным названием и выбором клиента.
- В карточку клиента добавлена вкладка "Проекты".
- Из карточки клиента проект создаётся с фиксированным клиентом.
- Добавлен workspace проекта с VS Code-подобной компоновкой:
  - `ProjectWorkspace`;
  - `ProjectToolbar`;
  - `ProjectLeftPanel`;
  - `ProjectCanvas`;
  - `ProjectRightPanel`.

### Изменённые файлы

#### Backend

- `backend/models.py`
- `backend/main.py`
- `backend/routes/projects.py`
- `backend/schemas/projects.py`
- `backend/services/projects.py`
- `backend/tests/test_projects_service.py`

#### Frontend

- `frontend/src/App.tsx`
- `frontend/src/components/Layout.tsx`
- `frontend/src/components/ProjectFormModal.tsx`
- `frontend/src/components/projects/ProjectWorkspace.tsx`
- `frontend/src/components/projects/ProjectToolbar.tsx`
- `frontend/src/components/projects/ProjectLeftPanel.tsx`
- `frontend/src/components/projects/ProjectCanvas.tsx`
- `frontend/src/components/projects/ProjectRightPanel.tsx`
- `frontend/src/pages/ProjectsPage.tsx`
- `frontend/src/pages/ProjectDetailPage.tsx`
- `frontend/src/pages/ClientDetailPage.tsx`
- `frontend/src/pages/projects/logic.ts`
- `frontend/src/pages/projects/logic.test.ts`
- `frontend/src/services/api.ts`
- `frontend/src/styles/styles.css`
- `frontend/src/types/projects.ts`

### Тесты и проверки

- Добавлены backend-тесты на создание проекта и связь с клиентом.
- Добавлены frontend-тесты чистой логики формы проекта.
- Запущено:
  - `.\.venv\Scripts\python.exe -m pytest backend\tests\test_projects_service.py` - успешно.
  - `npm.cmd run test -- --run src/pages/projects/logic.test.ts` - успешно.
  - `npm.cmd exec eslint -- ...` по новым проектным frontend-файлам и `ClientDetailPage.tsx` - успешно.
  - `npm.cmd run build` - успешно, обновлены `frontend/dist` hash-файлы.
- Полный `npm.cmd run lint` и полный `ruff check backend` сейчас падают на существующих несвязанных предупреждениях/ошибках в старых файлах.

### Риски и следующие шаги

- Для основного репозитория нужна полноценная миграция Alembic для таблицы `projects`; в lab-среде таблицу создаёт `Base.metadata.create_all`.
- Перед переносом проверить, нужно ли переносить `frontend/dist` и пересобранные hash-файлы.
- Следующий логичный шаг: добавить редактирование проекта и реальные артефакты внутри workspace.

---

## Навигация / Sidebar и профиль

### Что разрабатывалось

Небольшая UX-правка левого sidebar: вернуть функциональность сворачивания панели и убрать кнопку выхода из опасной близости к кнопке сворачивания.

### Что фактически реализовано

- В левый sidebar возвращена кнопка "Свернуть / Развернуть".
- Состояние sidebar сохраняется в `localStorage` через ключ `sidebar_collapsed`.
- При сворачивании используется существующий класс `.sidebar.sb-collapsed`.
- Кнопка "Выход" удалена из нижней панели sidebar.
- Выход перенесён в карточку пользователя на странице "Профиль".
- При выходе очищаются `access_token` и React Query cache, затем пользователь переводится на `/login`.
- В `ProfilePage` убраны старые `catch (err: any)` в изменённой зоне.

### Изменённые файлы

#### Frontend

- `frontend/src/components/Layout.tsx`
- `frontend/src/pages/ProfilePage.tsx`
- `frontend/src/styles/styles.css`
- `frontend/dist/index.html` и `frontend/dist/assets/*`

### Тесты и проверки

- Запущено:
  - `npm.cmd exec eslint -- src/components/Layout.tsx` - успешно.
  - `npm.cmd exec eslint -- src/components/Layout.tsx src/pages/ProfilePage.tsx` - успешно.
  - `npm.cmd run build` - успешно, обновлены `frontend/dist` hash-файлы.
  - `git diff --check` - успешно.

### Риски и следующие шаги

- Изменение относится к общему UI и должно переноситься вместе с обновлением frontend.
- Перед переносом проверить, требуется ли переносить `frontend/dist` в основном репозитории.

---

## Проекты / Теория проекта

### Контекст

- Репозиторий: `D:\consulting-automat-lab`
- Ветка: `telegram-secretary-local-core`
- Дата: 2026-06-14
- Цель: встроить экран "Теория проекта" в workspace карточки проекта по описанию из `Теория проекта.txt`.
- Ограничения: реализован frontend-экран формы без backend-сохранения, потому что схема хранения данных теории проекта пока не задана.

### Функционал, который разрабатывался

- При нажатии на карточку фреймворка "Теория проекта" в разделе "Проекты" должен открываться не пустой placeholder, а структурированный рабочий экран.
- Экран должен собирать проверяемую модель проекта:
  - миссия;
  - клиент / выгодоприобретатель;
  - критерии результата;
  - ключевые компетенции;
  - ограничения;
  - что нельзя разрушить;
  - методологическая проверка.

### Фактический функционал

- Добавлен отдельный canvas-компонент `ProjectTheoryCanvas`.
- `ProjectCanvas` теперь показывает этот экран для framework-card `project-theory`.
- Остальные разделы workspace и остальные карточки фреймворка продолжают использовать прежнюю заглушку.
- Экран содержит:
  - верхнюю панель с названием, описанием и статусом заполнения;
  - автопроверки в виде pill-индикаторов;
  - структурированные поля и таблицы для всех блоков из архитектурного описания;
  - нижнюю панель "Проверка теории проекта";
  - адаптивную верстку под текущую дизайн-систему.
- По уточнениям от 2026-06-14 доработан экран:
  - поле "Для кого проект создает ценность" стало multi-select;
  - в "Критерии результата" добавлена кнопка добавления новых карточек;
  - метрика результата разложена на название, количество, единицу измерения и период расчета;
  - для процессного результата автоматически подставляются значения "отсутствует" и "Реализовано в процесс";
  - даты результата и контрольные точки реализованы через calendar input;
  - контрольные точки можно добавлять внутри каждой карточки результата;
  - компетенции связываются с названиями результатов из блока выше;
  - при выборе "Другое" в релевантных dropdown появляется поле ручного уточнения;
  - ограничения связываются с ключевым результатом;
  - блок "Качество" переделан по структуре 5.3.1-5.3.9 с зависимым списком методов измерения.
- По уточнению от 2026-06-14 блок "Качество" отделен от "Ограничений":
  - ограничения остались отдельным блоком сроков, бюджета, ресурсов и запретов;
  - качество вынесено в самостоятельную секцию;
  - качество связывается с выбранным результатом проекта;
  - методологические проверки больше не трактуют качество как часть ограничений.

Что пока не реализовано:
- Сохранение данных в API/БД.
- Реальные вычисляемые автопроверки по заполненным полям.
- Автосборка формулировки миссии из введенных полей.

### Изменения, которые были произведены

#### Frontend

- Добавлен `frontend/src/components/projects/ProjectTheoryCanvas.tsx`.
- Обновлен `frontend/src/components/projects/ProjectCanvas.tsx`.
- Обновлен `frontend/src/components/projects/ProjectWorkspace.tsx`.
- Расширен project-блок стилей в `frontend/src/styles/styles.css`.
- В `ProjectTheoryCanvas` добавлено локальное состояние для динамических критериев результата, контрольных точек, мультивыбора выгодоприобретателей и зависимого блока качества.

#### Сборочные артефакты

- `npm.cmd run build` обновил `frontend/dist/index.html` и hash-файлы в `frontend/dist/assets`.
- При переносе в основной репозиторий нужно отдельно решить, переносить ли `frontend/dist`.

### Результаты тестов

- Команда: `npm.cmd run test`
- Рабочая директория: `D:\consulting-automat-lab\frontend`
- Результат: `4 passed`, `26 passed`.

- Команда: `npm.cmd run build`
- Рабочая директория: `D:\consulting-automat-lab\frontend`
- Результат: `tsc -b && vite build`, успешно, `✓ built`.

- Команда: `npm.cmd exec eslint -- src/components/projects/ProjectTheoryCanvas.tsx src/components/projects/ProjectCanvas.tsx src/components/projects/ProjectWorkspace.tsx`
- Рабочая директория: `D:\consulting-automat-lab\frontend`
- Результат: успешно.

- Команда: `npm.cmd run lint`
- Рабочая директория: `D:\consulting-automat-lab\frontend`
- Результат: падает на существующих несвязанных ошибках в старых файлах (`ChatPage.tsx`, `ClientsPage.tsx`, `CompanyPage.tsx`, `DepartmentDetailPage.tsx`, `FunctionDetailPage.tsx`, `KnowledgePage.tsx`, `LoginPage.tsx`, `OrchestrationPage.tsx`, `TasksPage.tsx`, `TrackerPage.tsx`).
- Предупреждения: новые файлы `ProjectTheoryCanvas.tsx`, `ProjectCanvas.tsx`, `ProjectWorkspace.tsx` в выводе lint-ошибок не фигурируют.

### Найденные ошибки и устранение

- Ошибка: `ProjectTheorySection` сначала использовал namespace `React.ReactNode` без явного импорта.
- Причина: в проекте используется JSX runtime, но для типа children лучше не полагаться на глобальный namespace.
- Исправление: добавлен `import type { ReactNode } from 'react'` и тип `ReactNode`.
- Как проверено: `npm.cmd run build` успешно.

### Измененные файлы

- `frontend/src/components/projects/ProjectTheoryCanvas.tsx` - новый структурированный экран "Теория проекта".
- `frontend/src/components/projects/ProjectCanvas.tsx` - условное отображение экрана теории проекта для `project-theory`.
- `frontend/src/components/projects/ProjectWorkspace.tsx` - передача id активной framework-карточки в canvas.
- `frontend/src/styles/styles.css` - стили экрана, секций, таблиц, проверок и адаптива.
- `frontend/dist/index.html` и `frontend/dist/assets/*` - сгенерированные build-артефакты.
- `docs/TRANSFER_LOG.md` - добавлена запись по блоку.

### Заметки для переноса в основной репозиторий

- Обязательно переносить frontend-компонент и изменения `ProjectCanvas`/`ProjectWorkspace`/`styles.css`.
- Осторожно переносить `frontend/dist`: только если основной репозиторий хранит собранный frontend.
- Для полноценного продукта нужен следующий шаг: схема данных и API для сохранения "Теории проекта", а затем вычисляемые проверки заполненности.
