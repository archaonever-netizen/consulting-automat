-- База знаний: разделы и статьи.
-- Контент для людей (рендер в UI) и для ИИ (дайджест в системный промпт).

CREATE TABLE IF NOT EXISTS knowledge_categories (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(50)  NOT NULL UNIQUE,
    title       VARCHAR(150) NOT NULL,
    description TEXT,
    icon_key    VARCHAR(50),
    layout      VARCHAR(20)  NOT NULL DEFAULT 'cards',
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMP    DEFAULT NOW(),
    updated_at  TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_articles (
    id            SERIAL PRIMARY KEY,
    category_id   INTEGER      NOT NULL REFERENCES knowledge_categories(id) ON DELETE CASCADE,
    title         VARCHAR(200) NOT NULL,
    slug          VARCHAR(80),
    summary       TEXT,
    body          TEXT,
    icon_key      VARCHAR(50),
    route         VARCHAR(120),
    tags          JSON,
    sort_order    INTEGER      NOT NULL DEFAULT 0,
    is_published  BOOLEAN      NOT NULL DEFAULT TRUE,
    ai_visible    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by_id INTEGER      REFERENCES users(id),
    created_at    TIMESTAMP    DEFAULT NOW(),
    updated_at    TIMESTAMP    DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_knowledge_articles_category ON knowledge_articles(category_id);
