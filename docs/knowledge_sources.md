# Knowledge sources

The knowledge base has two layers:

- `knowledge_categories` / `knowledge_articles` are editable UI articles.
- `knowledge_sources` and related tables are source-backed material for future RAG.

## Source-backed schema

- `knowledge_sources`: source metadata such as title, type, version, language, source file, URL, processing status, checksum, and processing dates.
- `knowledge_source_texts`: full extracted source text. Use `text_origin = source_original`.
- `knowledge_source_fragments`: source chunks for search/embeddings. `full_text` must stay source-backed; generated summaries are stored in `summary` with `summary_origin = ai_generated`.
- `knowledge_source_layers`: generated document-level layers such as description, context, and key points. Use `content_origin = ai_generated`.
- `knowledge_sections`: hierarchical taxonomy for UI navigation.
- `knowledge_source_section_links`: many-to-many links from a source to categories/themes.

## BPMM import

`seed_bpmm_source` in `backend/services/knowledge.py` imports `BPMM/BPMM.pdf`.

The importer:

1. Computes a SHA-256 checksum of the PDF.
2. Skips import when the already processed `bpmm` source has the same checksum.
3. Extracts page text with `pypdf`.
4. Stores the complete extracted text as `source_original`.
5. Uses the PDF outline/bookmarks as the fragmentation basis.
6. Stores generated fragment summaries separately from source text.
7. Creates the UI hierarchy:
   - `Методологии и фреймворки`
   - `Методологии процессов`
   - `Источники`
   - `BPMM`
8. Links BPMM to the thematic `Процессы` section.

Fragmentation note: BPMM has multiple outline entries that start on the same PDF page. The importer uses page-level extraction and does not guess smaller text boundaries inside a page. In those cases, adjacent fragments can contain duplicated same-page source text. This is safer than inventing boundaries not present in the extracted source structure.

## Adding another methodology

1. Put the original file under a stable repository path, for example `docs/sources/<name>/<file>.pdf`.
2. Add a seed/import function similar to `seed_bpmm_source`.
3. Set a stable `KnowledgeSource.key`.
4. Store source metadata in `knowledge_sources`.
5. Store full extracted text in `knowledge_source_texts` with `source_original`.
6. Fragment from the document's explicit structure: outline, headings, chapters, or sections.
7. Store generated summaries/context/description only in generated fields:
   - fragment `summary` with `summary_origin = ai_generated`
   - source layers with `content_origin = ai_generated`
8. Link the source to one or more `knowledge_sections`.
9. Add focused tests or run the app startup to verify the source appears under `/api/knowledge/source-tree` and `/knowledge`.

