-- RAG-ready knowledge source layer.
-- Original source text is stored separately from generated summaries/context.

CREATE TABLE IF NOT EXISTS knowledge_sections (
    id           SERIAL PRIMARY KEY,
    key          VARCHAR(80)  NOT NULL UNIQUE,
    title        VARCHAR(200) NOT NULL,
    description  TEXT,
    parent_id    INTEGER REFERENCES knowledge_sections(id) ON DELETE CASCADE,
    section_type VARCHAR(40)  NOT NULL DEFAULT 'category',
    sort_order   INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMP    DEFAULT NOW(),
    updated_at   TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_sources (
    id                SERIAL PRIMARY KEY,
    key               VARCHAR(80)  NOT NULL UNIQUE,
    title             VARCHAR(255) NOT NULL,
    source_type       VARCHAR(50)  NOT NULL,
    version           VARCHAR(80),
    language          VARCHAR(20)  NOT NULL DEFAULT 'en',
    source_file       VARCHAR(500) NOT NULL,
    source_url        VARCHAR(500),
    processing_status VARCHAR(40)  NOT NULL DEFAULT 'pending',
    checksum          VARCHAR(64),
    metadata_json     JSON,
    added_at          TIMESTAMP    DEFAULT NOW(),
    processed_at      TIMESTAMP,
    created_at        TIMESTAMP    DEFAULT NOW(),
    updated_at        TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_source_texts (
    id                SERIAL PRIMARY KEY,
    source_id         INTEGER NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    text              TEXT    NOT NULL,
    text_origin       VARCHAR(40)  NOT NULL DEFAULT 'source_original',
    extraction_method VARCHAR(120) NOT NULL,
    created_at        TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_source_fragments (
    id             SERIAL PRIMARY KEY,
    source_id      INTEGER      NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    title          VARCHAR(300) NOT NULL,
    full_text      TEXT         NOT NULL,
    summary        TEXT,
    summary_origin VARCHAR(40)  NOT NULL DEFAULT 'ai_generated',
    text_origin    VARCHAR(40)  NOT NULL DEFAULT 'source_original',
    sort_order     INTEGER      NOT NULL,
    outline_level  INTEGER      NOT NULL DEFAULT 0,
    page_start     INTEGER,
    page_end       INTEGER,
    source_ref     VARCHAR(500) NOT NULL,
    metadata_json  JSON,
    created_at     TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_source_layers (
    id             SERIAL PRIMARY KEY,
    source_id      INTEGER      NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    layer_type     VARCHAR(40)  NOT NULL,
    title          VARCHAR(200) NOT NULL,
    content        TEXT         NOT NULL,
    content_origin VARCHAR(40)  NOT NULL DEFAULT 'ai_generated',
    sort_order     INTEGER      NOT NULL DEFAULT 0,
    created_at     TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_source_section_links (
    id            SERIAL PRIMARY KEY,
    source_id     INTEGER     NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    section_id    INTEGER     NOT NULL REFERENCES knowledge_sections(id) ON DELETE CASCADE,
    relation_type VARCHAR(40) NOT NULL DEFAULT 'listed_under',
    sort_order    INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMP   DEFAULT NOW(),
    CONSTRAINT uq_knowledge_source_section UNIQUE (source_id, section_id, relation_type)
);

CREATE INDEX IF NOT EXISTS ix_knowledge_sections_parent ON knowledge_sections(parent_id);
CREATE INDEX IF NOT EXISTS ix_knowledge_sources_status ON knowledge_sources(processing_status);
CREATE INDEX IF NOT EXISTS ix_knowledge_fragments_source_order
    ON knowledge_source_fragments(source_id, sort_order);
CREATE INDEX IF NOT EXISTS ix_knowledge_source_section_section
    ON knowledge_source_section_links(section_id);

