# Telegram Secretary: Local Core

Цель первого этапа - сделать маленькое локальное ядро секретаря, которое можно дергать из Telegram, MAX, веб-интерфейса или локальных тестов без переписывания бизнес-логики.

## Контуры

- `secretary_core` - чистое ядро: разбирает намерение, работает с задачами, возвращает текст ответа.
- `telegram_secretary` - адаптер Telegram: достает `chat_id`, `user_id`, текст сообщения и отправляет ответ через Bot API.
- `routes/secretary.py` - локальная ручка для тестов и webhook Telegram.
- существующая таблица `user_tasks` - первая память секретаря; отдельные напоминания и повторения добавим следующим слоем.

## Почему пока без OpenClaw

На первом этапе не нужен генератор скелета или автономный агент с широкими правами. Нам важнее контролируемая основа: минимум файлов, понятные маршруты, тесты и отсутствие произвольных действий от ИИ. Если OpenClaw понадобится позже, его стоит запускать изолированно и принимать результат только через review.

## Локальный тест

После запуска backend можно проверить ядро без Telegram:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:8000/api/secretary/local/message `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"text":"добавь задачу подготовить КП на 45 минут"}'
```

Затем:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:8000/api/secretary/local/message `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"text":"задачи"}'
```

## Telegram webhook

Настройки в `.env.local`:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
SECRETARY_OWNER_TELEGRAM_ID=
SECRETARY_LOCAL_USER_EMAIL=
```

Webhook endpoint:

```text
POST /api/secretary/telegram/webhook
```

Для production Telegram требует публичный HTTPS URL. Для локальной разработки можно использовать tunnel, но токен и secret нельзя коммитить.

Пример регистрации webhook после поднятия HTTPS/tunnel:

```powershell
$token = "<TELEGRAM_BOT_TOKEN>"
$secret = "<TELEGRAM_WEBHOOK_SECRET>"
$url = "https://<public-host>/api/secretary/telegram/webhook"
Invoke-RestMethod `
  -Uri "https://api.telegram.org/bot$token/setWebhook" `
  -Method Post `
  -ContentType "application/json" `
  -Body (@{ url = $url; secret_token = $secret } | ConvertTo-Json)
```

Исходящий тест из приложения идет через:

```text
POST /api/secretary/telegram/send
```

Команда в локальном чате секретаря:

```text
отправь сообщение Я на связи, отвечу позже
```

Она использует `TELEGRAM_BOT_TOKEN` и `SECRETARY_OWNER_TELEGRAM_ID`, если `chat_id` не передан явно через API.

## Следующие слои

- связать задачи с календарем и свободными слотами;
- добавить отдельные напоминания и recurring rules;
- добавить LLM-парсер с подтверждением действий;
- добавить outbox, чтобы локальный режим и fallback API-hosting работали одинаково;
- подключить MAX как второй транспорт поверх того же `secretary_core`.
