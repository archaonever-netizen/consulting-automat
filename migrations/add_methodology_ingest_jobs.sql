-- Экран «Добавить методологию»: фоновые задачи импорта источника.
-- Применено в боевую Supabase 2026-06-14 (миграция add_ingest_jobs_table).
-- Только добавляет новую таблицу. Видимость источников при импорте защищена
-- отдельно: поиск показывает только processing_status='processed' (см.
-- backend/services/knowledge_search.py), поэтому недоделанные импорты невидимы.

CREATE TABLE IF NOT EXISTS public.ingest_jobs (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_key        varchar(80)  NOT NULL,
    title             varchar(255),
    -- draft | queued | running | done | failed | cancelled
    status            varchar(20)  NOT NULL DEFAULT 'draft',
    -- extract | ingest | embed_fragments | layers | embed_cards | attach | finished
    stage             varchar(40),
    progress          text,
    storage_path      varchar(500),    -- PDF в Supabase Storage (хранится и при сбое, для повтора)
    framework_key     varchar(80),     -- кластер (существующий или создаваемый)
    framework_name    varchar(200),
    methodology       varchar(80),
    language          varchar(20),
    confidential      boolean      NOT NULL DEFAULT false,
    est_pages         integer,
    est_cost_rub      numeric(10,2),
    tokens_embeddings integer      NOT NULL DEFAULT 0,  -- накопительно (вкл. сбойные попытки)
    tokens_generation integer      NOT NULL DEFAULT 0,
    error             text,
    created_by_id     integer,
    created_at        timestamptz  NOT NULL DEFAULT now(),
    updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_ingest_jobs_status ON public.ingest_jobs (status);
CREATE INDEX IF NOT EXISTS ix_ingest_jobs_source ON public.ingest_jobs (source_key);

ALTER TABLE public.ingest_jobs ENABLE ROW LEVEL SECURITY;
