-- RAG / "умный поиск" для ИИ-Методолога — Фаза 1 (структура базы).
-- Применено в боевую Supabase (проект consulting automat) 2026-06-14 двумя
-- миграциями: rag_extensions_and_search_columns, rag_cards_and_embeddings_tables.
--
-- Принципы: только ДОБАВЛЯЕМ (новые расширения/колонки/таблицы), ничего
-- существующего не удаляем и не переписываем. Всё идемпотентно (IF NOT EXISTS),
-- повторный прогон безопасен. Оригинальный текст источника остаётся неизменным.

-- ── Расширения ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;   -- векторный поиск по смыслу (pgvector)
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- поиск по точным словам / опечаткам

-- ── Источники: конфиденциальность + методология ───────────────────────────
ALTER TABLE public.knowledge_sources
    ADD COLUMN IF NOT EXISTS confidential boolean NOT NULL DEFAULT false;
ALTER TABLE public.knowledge_sources
    ADD COLUMN IF NOT EXISTS methodology varchar(80);

-- ── Фрагменты: метаданные для фильтруемого гибридного поиска ────────────────
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS methodology    varchar(80);
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS maturity_level varchar(40);
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS content_type   varchar(40);
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS lang           varchar(20);
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS source_version varchar(80);
-- Денормализованный флаг (синхронизируется загрузчиком) — чтобы построитель
-- эмбеддингов и поиск могли фильтровать конфиденциальное без join.
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS confidential   boolean NOT NULL DEFAULT false;

-- Поисковый вектор слов. Конфиг 'simple' => без стемминга, работает и для
-- русского, и для английского. STORED-колонка синхронизируется автоматически.
ALTER TABLE public.knowledge_source_fragments
    ADD COLUMN IF NOT EXISTS search_tsv tsvector
    GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(full_text, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS ix_frag_search_tsv
    ON public.knowledge_source_fragments USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS ix_frag_fulltext_trgm
    ON public.knowledge_source_fragments USING gin (full_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS ix_frag_content_type
    ON public.knowledge_source_fragments (content_type);
CREATE INDEX IF NOT EXISTS ix_frag_methodology
    ON public.knowledge_source_fragments (methodology);
CREATE INDEX IF NOT EXISTS ix_frag_confidential
    ON public.knowledge_source_fragments (confidential);

-- ── Производные карточки: методики, типичные ошибки, диагностические вопросы ─
CREATE TABLE IF NOT EXISTS public.knowledge_cards (
    id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_id               integer NOT NULL REFERENCES public.knowledge_sources(id) ON DELETE CASCADE,
    card_type               varchar(40)  NOT NULL,   -- method_card | typical_error | diagnostic_question
    card_key                varchar(160) NOT NULL,   -- стабильный ключ для идемпотентной перегенерации
    methodology             varchar(80),
    maturity_level          varchar(40),
    title                   varchar(300) NOT NULL,
    body                    text         NOT NULL,
    content_origin          varchar(40)  NOT NULL DEFAULT 'ai_generated',
    lang                    varchar(20),
    confidential            boolean      NOT NULL DEFAULT false,
    -- Честные ссылки: карточка может указывать только на реальные страницы источника.
    supporting_fragment_id  integer REFERENCES public.knowledge_source_fragments(id) ON DELETE SET NULL,
    page_start              integer,
    page_end                integer,
    source_ref              varchar(500),
    sort_order              integer      NOT NULL DEFAULT 0,
    content_hash            varchar(64),
    metadata_json           jsonb,
    created_at              timestamptz  NOT NULL DEFAULT now(),
    updated_at              timestamptz  NOT NULL DEFAULT now(),
    search_tsv              tsvector GENERATED ALWAYS AS (
        to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(body, ''))
    ) STORED,
    CONSTRAINT uq_knowledge_cards_key UNIQUE (source_id, card_key)
);

CREATE INDEX IF NOT EXISTS ix_cards_type         ON public.knowledge_cards (card_type);
CREATE INDEX IF NOT EXISTS ix_cards_methodology  ON public.knowledge_cards (methodology);
CREATE INDEX IF NOT EXISTS ix_cards_source       ON public.knowledge_cards (source_id);
CREATE INDEX IF NOT EXISTS ix_cards_confidential ON public.knowledge_cards (confidential);
CREATE INDEX IF NOT EXISTS ix_cards_search_tsv   ON public.knowledge_cards USING gin (search_tsv);
CREATE INDEX IF NOT EXISTS ix_cards_body_trgm    ON public.knowledge_cards USING gin (body gin_trgm_ops);

-- ── Хранилище эмбеддингов (полиморфное, без фиксации размерности) ───────────
-- Размерность вектора и ANN-индекс (HNSW) добавляются в начале Фазы 3, когда
-- подтверждена модель эмбеддингов. До этого векторы хранятся как есть.
CREATE TABLE IF NOT EXISTS public.knowledge_embeddings (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_type   varchar(20)  NOT NULL,   -- fragment | card
    owner_id     integer      NOT NULL,
    model_name   varchar(120) NOT NULL,
    dim          integer      NOT NULL,
    embedding    vector       NOT NULL,
    content_hash varchar(64)  NOT NULL,   -- чтобы не пересчитывать неизменённое
    confidential boolean      NOT NULL DEFAULT false,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_knowledge_embeddings UNIQUE (owner_type, owner_id, model_name)
);

CREATE INDEX IF NOT EXISTS ix_emb_owner ON public.knowledge_embeddings (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS ix_emb_model ON public.knowledge_embeddings (model_name);

-- ── RLS на НОВЫХ таблицах (закрываем доступ anon; backend ходит ролью postgres,
-- которая обходит RLS). Существующие таблицы НЕ трогаем. ────────────────────
ALTER TABLE public.knowledge_cards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_embeddings ENABLE ROW LEVEL SECURITY;
