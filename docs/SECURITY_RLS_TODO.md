# TODO (безопасность): включить RLS на старых таблицах Supabase

Статус: **отложено по решению владельца (2026-06-14).** Заняться отдельной задачей.

## В чём проблема (простыми словами)

В боевой базе Supabase у **20 таблиц отключена защита RLS** (Row Level Security).
Это значит: любой, у кого есть публичный `anon`-ключ проекта, теоретически может
читать и менять все строки этих таблиц — включая клиентов, брифы, задачи, чаты и
базу знаний. Сейчас приложение ходит в базу серверной ролью `postgres` (она
обходит RLS), поэтому всё работает; но «дыра» для публичного ключа реальна.

Дополнительно: на части таблиц, где RLS уже включён, стоят политики «разрешить
всем» (`USING (true)`) — это тоже фактически открытый доступ и требует пересмотра.

Это **существующая** ситуация, не связанная с задачей «умного поиска».
Новые таблицы RAG (`knowledge_cards`, `knowledge_embeddings`) уже защищены.

## Таблицы без RLS (на 2026-06-14)

user_tasks, user_chat_messages, kaiten_connections, task_completions,
user_subchats, ai_tasks, knowledge_categories, ai_agents,
knowledge_source_texts, knowledge_source_layers, knowledge_articles,
goal_documents, orchestration_runs, ai_agent_runs, function_analyses,
knowledge_sources, knowledge_sections, knowledge_source_section_links,
user_chat_sessions, knowledge_source_fragments.

## Как будем чинить (план на будущее)

1. Решить модель доступа: сейчас бэкенд ходит ролью, обходящей RLS, поэтому
   простой безопасный шаг — **включить RLS без политик** для `anon`/`authenticated`
   (полностью закрыть прямой доступ по публичному ключу), не ломая бэкенд.
   - ВНИМАНИЕ: включать RLS нужно вместе с проверкой, что приложение не использует
     публичный `anon`-ключ для этих таблиц напрямую (иначе доступ пропадёт).
2. Для таблиц с публичным контентом (например, статьи базы знаний) при желании
   добавить отдельную политику «только чтение для всех».
3. Пересмотреть существующие политики `USING (true)` на пользовательских данных
   (clients, briefs, users и т.п.) — заменить на доступ по владельцу/клиенту.
4. Перед включением — показать SQL и план владельцу, прогнать на проверочной
   копии, и только потом применять в боевую базу.

## Готовый «закрывающий» SQL (НЕ применять без проверки шага 1)

```sql
ALTER TABLE public.user_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kaiten_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subchats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_source_texts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_source_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orchestration_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_source_section_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_source_fragments ENABLE ROW LEVEL SECURITY;
```

Документация Supabase: https://supabase.com/docs/guides/database/postgres/row-level-security
