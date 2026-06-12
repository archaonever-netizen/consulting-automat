import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

// База знаний — редактируемая внутренняя документация ШЕФ.
// Контент хранится в БД (knowledge_categories / knowledge_articles) и доступен
// ИИ-помощникам через дайджест. Редактирование доступно только основателю.

interface Article {
  id: number;
  category_id: number;
  title: string;
  summary: string | null;
  body: string | null;
  icon_key: string | null;
  route: string | null;
  tags: string[] | null;
  sort_order: number;
  is_published: boolean;
  ai_visible: boolean;
}

interface Category {
  id: number;
  key: string;
  title: string;
  description: string | null;
  icon_key: string | null;
  layout: string; // 'cards' | 'list' | 'glossary'
  sort_order: number;
  articles: Article[];
}

interface SourceLayer {
  id: number;
  layer_type: string;
  title: string;
  content: string;
  content_origin: string;
  sort_order: number;
}

interface KnowledgeSource {
  id: number;
  key: string;
  title: string;
  source_type: string;
  version: string | null;
  language: string;
  source_file: string;
  source_url: string | null;
  processing_status: string;
  added_at: string;
  processed_at: string | null;
  layers: SourceLayer[];
}

interface SourceFragment {
  id: number;
  title: string;
  full_text: string;
  summary: string | null;
  summary_origin: string;
  text_origin: string;
  sort_order: number;
  outline_level: number;
  page_start: number | null;
  page_end: number | null;
  source_ref: string;
  metadata_json: Record<string, unknown> | null;
}

interface SourceDetail extends KnowledgeSource {
  fragments: SourceFragment[];
  texts: { id: number; text: string; text_origin: string; extraction_method: string }[];
}

interface SectionLink {
  relation_type: string;
  sort_order: number;
  source: KnowledgeSource;
}

interface KnowledgeSection {
  id: number;
  key: string;
  title: string;
  description: string | null;
  section_type: string;
  sort_order: number;
  children: KnowledgeSection[];
  source_links: SectionLink[];
}

interface SourceCardItem {
  source: KnowledgeSource;
  path: string[];
}

const ICON_HINTS = ['home', 'chat', 'users', 'chart', 'check', 'sparkle', 'doc', 'book', 'grid', 'bolt', 'gear', 'clock'];
const LAYOUTS = [
  { v: 'cards', label: 'Карточки' },
  { v: 'list', label: 'Блоки (список)' },
  { v: 'glossary', label: 'Глоссарий' },
];

function matches(q: string, ...fields: (string | null)[]): boolean {
  if (!q) return true;
  const hay = fields.filter(Boolean).join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

export default function KnowledgePage() {
  const queryClient = useQueryClient();
  const { data: me } = useQuery<{ is_founder?: boolean }>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/api/auth/me')).data,
    staleTime: 5 * 60_000,
  });
  const isFounder = !!me?.is_founder;
  const { data: cats = [], isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ['knowledge'],
    queryFn: async () => (await api.get<Category[]>('/api/knowledge')).data,
  });
  const { data: sourceTree = [], isLoading: treeLoading } = useQuery<KnowledgeSection[]>({
    queryKey: ['knowledge-sources'],
    queryFn: async () => (await api.get<KnowledgeSection[]>('/api/knowledge/source-tree')).data,
  });
  const loading = catsLoading || treeLoading;
  const [sourceDetail, setSourceDetail] = useState<SourceDetail | null>(null);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [artModal, setArtModal] = useState<Partial<Article> | null>(null);
  const [catModal, setCatModal] = useState<Partial<Category> | null>(null);
  const sectionsRef = useRef<Record<string, HTMLElement | null>>({});

  // Вызывается после правок статей/разделов — сбрасывает кэш базы знаний
  async function load() {
    await queryClient.invalidateQueries({ queryKey: ['knowledge'] });
  }

  async function openSource(sourceId: number) {
    setSourceLoading(true);
    try {
      const r = await api.get<SourceDetail>(`/api/knowledge/sources/${sourceId}`);
      setSourceDetail(r.data);
    } finally {
      setSourceLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return cats
      .map(c => ({ ...c, articles: c.articles.filter(a => matches(query, a.title, a.summary, a.body)) }))
      .filter(c => editMode || c.articles.length > 0);
  }, [cats, query, editMode]);

  const sourceCards = useMemo(() => {
    const cards = collectSourceCards(sourceTree);
    return cards.filter(card => matches(
      query,
      card.source.title,
      card.source.source_type,
      card.source.source_file,
      card.path.join(' '),
      card.source.layers.map(layer => layer.content).join(' ')
    ));
  }, [sourceTree, query]);

  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => {
        const vis = entries.filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );
    Object.values(sectionsRef.current).forEach(el => el && obs.observe(el));
    return () => obs.disconnect();
  }, [filtered.length]);

  const go = (id: string) => sectionsRef.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const setRef = (id: string) => (el: HTMLElement | null) => { sectionsRef.current[id] = el; };

  async function delArticle(a: Article) {
    if (!confirm(`Удалить «${a.title}»?`)) return;
    await api.delete(`/api/knowledge/articles/${a.id}`);
    load();
  }
  async function delCategory(c: Category) {
    if (!confirm(`Удалить раздел «${c.title}» со всеми статьями?`)) return;
    await api.delete(`/api/knowledge/categories/${c.id}`);
    load();
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page kb">
      <div className="page-head rise">
        <div>
          <h1>База знаний</h1>
          <p>Как устроено приложение ШЕФ — разделы, сеть агентов, сценарии и термины.</p>
        </div>
        <div className="kb-head-actions">
          <div className="kb-search">
            <Icon name="search" size={16} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск…" />
            {query && (
              <button className="kb-search-clear" onClick={() => setQuery('')} title="Очистить">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
          {isFounder && (
            <button
              className={'btn ' + (editMode ? 'btn-primary' : 'btn-secondary')}
              onClick={() => setEditMode(v => !v)}
            >
              <Icon name={editMode ? 'check' : 'edit'} size={16} />
              {editMode ? 'Готово' : 'Редактировать'}
            </button>
          )}
        </div>
      </div>

      {editMode && (
        <div className="kb-editbar rise">
          <span>Режим редактирования. Изменения сразу доступны ИИ-помощникам.</span>
          <button className="btn btn-soft btn-sm" onClick={() => setCatModal({ layout: 'cards', sort_order: cats.length })}>
            <Icon name="plus" size={15} />Добавить раздел
          </button>
        </div>
      )}

      <div className="kb-layout">
        <nav className="kb-toc">
          {sourceTree.length > 0 && (
            <button
              className={'kb-toc-item' + (active === 'kb-source-tree' ? ' active' : '')}
              onClick={() => go('kb-source-tree')}
            >
              <Icon name="book" size={17} stroke={1.9} />
              <span>Методологии и фреймворки</span>
            </button>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              className={'kb-toc-item' + (active === `cat-${c.id}` ? ' active' : '')}
              onClick={() => go(`cat-${c.id}`)}
            >
              <Icon name={c.icon_key || 'book'} size={17} stroke={1.9} />
              <span>{c.title}</span>
            </button>
          ))}
        </nav>

        <div className="kb-main">
          {sourceTree.length > 0 && (
            <section id="kb-source-tree" ref={setRef('kb-source-tree')} className="kb-section">
              <div className="kb-sec-head">
                <div className="eyebrow">Методологии и фреймворки</div>
              </div>
              <div className="kb-cards">
                {sourceCards.map(({ source, path }) => {
                  const description = source.layers.find(l => l.layer_type === 'description');
                  return (
                    <button
                      key={source.id}
                      className="kb-card kb-source-card"
                      type="button"
                      onClick={() => openSource(source.id)}
                    >
                      <div className="kb-card-head">
                        <span className="kb-card-icon"><Icon name="doc" size={19} stroke={1.9} /></span>
                        <div className="kb-card-title">
                          <b>{source.title}</b>
                        </div>
                        <span className="kb-card-open" title="Открыть источник"><Icon name="arrowRight" size={16} /></span>
                      </div>
                      <p className="kb-card-sum">
                        {path.slice(1).join(' / ') || source.source_type}
                      </p>
                      {description && <p className="kb-card-sum">{description.content}</p>}
                      <div className="kb-source-card-meta">
                        <span>v{source.version || 'n/a'}</span>
                        <span>{source.language}</span>
                        <span>{source.processing_status}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {filtered.map(c => (
            <section key={c.id} id={`cat-${c.id}`} ref={setRef(`cat-${c.id}`)} className="kb-section">
              <div className="kb-sec-head">
                <div className="eyebrow">{c.title}</div>
                {editMode && (
                  <div className="kb-sec-tools">
                    <button className="kb-icon-btn" title="Добавить статью"
                      onClick={() => setArtModal({ category_id: c.id, is_published: true, ai_visible: true, sort_order: c.articles.length })}>
                      <Icon name="plus" size={15} />
                    </button>
                    <button className="kb-icon-btn" title="Изменить раздел" onClick={() => setCatModal(c)}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button className="kb-icon-btn danger" title="Удалить раздел" onClick={() => delCategory(c)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                )}
              </div>

              {c.layout === 'glossary' ? (
                <dl className="kb-gloss">
                  {c.articles.map(a => (
                    <div key={a.id} className="kb-gloss-row">
                      <dt>{a.title}{!a.is_published && <span className="kb-draft">черновик</span>}</dt>
                      <dd>{a.summary}</dd>
                      {editMode && <ArtTools onEdit={() => setArtModal(a)} onDel={() => delArticle(a)} />}
                    </div>
                  ))}
                </dl>
              ) : c.layout === 'list' ? (
                <div className="kb-arch">
                  {c.articles.map(a => (
                    <div key={a.id} className="kb-arch-block">
                      <h3>{a.title}{!a.is_published && <span className="kb-draft">черновик</span>}
                        {editMode && <ArtTools onEdit={() => setArtModal(a)} onDel={() => delArticle(a)} inline />}
                      </h3>
                      {a.summary && <p>{a.summary}</p>}
                      {a.body && <div className="md"><ReactMarkdown>{a.body}</ReactMarkdown></div>}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="kb-cards">
                  {c.articles.map(a => (
                    <article key={a.id} className="kb-card">
                      <div className="kb-card-head">
                        <span className="kb-card-icon"><Icon name={a.icon_key || 'doc'} size={19} stroke={1.9} /></span>
                        <div className="kb-card-title">
                          <b>{a.title}</b>
                          {!a.is_published && <span className="kb-draft">черновик</span>}
                        </div>
                        {a.route && !editMode && (
                          <Link to={a.route} className="kb-card-open" title="Открыть раздел"><Icon name="arrowRight" size={16} /></Link>
                        )}
                        {editMode && <ArtTools onEdit={() => setArtModal(a)} onDel={() => delArticle(a)} />}
                      </div>
                      {a.summary && <p className="kb-card-sum">{a.summary}</p>}
                      {a.body && <div className="md kb-card-body"><ReactMarkdown>{a.body}</ReactMarkdown></div>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          ))}
          {filtered.length === 0 && <p className="kb-empty">Ничего не найдено.</p>}
        </div>
      </div>

      {artModal && (
        <ArticleModal
          draft={artModal}
          categories={cats}
          onClose={() => setArtModal(null)}
          onSaved={() => { setArtModal(null); load(); }}
        />
      )}
      {catModal && (
        <CategoryModal
          draft={catModal}
          onClose={() => setCatModal(null)}
          onSaved={() => { setCatModal(null); load(); }}
        />
      )}
      {(sourceDetail || sourceLoading) && (
        <SourceDetailModal
          source={sourceDetail}
          loading={sourceLoading}
          onClose={() => setSourceDetail(null)}
        />
      )}
    </div>
  );
}

function collectSourceCards(sections: KnowledgeSection[], path: string[] = []): SourceCardItem[] {
  const cards: SourceCardItem[] = [];
  for (const section of sections) {
    const nextPath = [...path, section.title];
    for (const link of section.source_links) {
      cards.push({ source: link.source, path: nextPath });
    }
    cards.push(...collectSourceCards(section.children, nextPath));
  }
  const seen = new Set<number>();
  return cards.filter(card => {
    if (seen.has(card.source.id)) return false;
    seen.add(card.source.id);
    return true;
  });
}

function SourceDetailModal({ source, loading, onClose }: {
  source: SourceDetail | null;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <div className="kb-modal-bg" onClick={onClose}>
      <div className="kb-modal kb-source-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-modal-head">
          <h3>{loading ? 'Загрузка источника' : source?.title}</h3>
          <button className="kb-icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        {loading || !source ? (
          <div className="kb-form"><div className="loading-bar"></div></div>
        ) : (
          <div className="kb-source-detail">
            <div className="kb-source-meta">
              <span>Тип: {source.source_type}</span>
              <span>Версия: {source.version || 'не указана'}</span>
              <span>Язык: {source.language}</span>
              <span>Файл: {source.source_file}</span>
              <span>Статус: {source.processing_status}</span>
            </div>
            {source.layers.map(layer => (
              <section key={layer.id} className="kb-source-layer">
                <div className="kb-layer-title">
                  <b>{layer.title}</b>
                  <span>{layer.content_origin}</span>
                </div>
                <ReactMarkdown>{layer.content}</ReactMarkdown>
              </section>
            ))}
            <section className="kb-source-layer">
              <div className="kb-layer-title">
                <b>Фрагменты источника</b>
                <span>{source.fragments.length} chunks</span>
              </div>
              <div className="kb-fragment-list">
                {source.fragments.slice(0, 40).map(fragment => (
                  <details key={fragment.id} className="kb-fragment">
                    <summary>
                      <span>{fragment.title}</span>
                      <small>
                        pages {fragment.page_start}-{fragment.page_end} · text: {fragment.text_origin} · summary: {fragment.summary_origin}
                      </small>
                    </summary>
                    {fragment.summary && <p>{fragment.summary}</p>}
                    <pre>{fragment.full_text.slice(0, 2400)}{fragment.full_text.length > 2400 ? '\n...' : ''}</pre>
                  </details>
                ))}
              </div>
            </section>
            <section className="kb-source-layer">
              <div className="kb-layer-title">
                <b>Оригинальный текст источника</b>
                <span>{source.texts[0]?.text_origin || 'source_original'}</span>
              </div>
              <p className="kb-origin-note">
                Полный extracted text сохранен в БД отдельно от AI-generated слоев.
                Метод извлечения: {source.texts[0]?.extraction_method || 'n/a'}.
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function ArtTools({ onEdit, onDel, inline }: { onEdit: () => void; onDel: () => void; inline?: boolean }) {
  return (
    <span className={'kb-art-tools' + (inline ? ' inline' : '')}>
      <button className="kb-icon-btn" title="Изменить" onClick={onEdit}><Icon name="edit" size={13} /></button>
      <button className="kb-icon-btn danger" title="Удалить" onClick={() => onDel()}><Icon name="trash" size={13} /></button>
    </span>
  );
}

function ArticleModal({ draft, categories, onClose, onSaved }: {
  draft: Partial<Article>;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Article>>(draft);
  const [saving, setSaving] = useState(false);
  const isNew = !draft.id;
  const set = (k: keyof Article, v: unknown) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.title?.trim() || !f.category_id) return;
    setSaving(true);
    try {
      const payload = {
        category_id: f.category_id,
        title: f.title,
        summary: f.summary ?? null,
        body: f.body ?? null,
        icon_key: f.icon_key || null,
        route: f.route || null,
        sort_order: f.sort_order ?? 0,
        is_published: f.is_published ?? true,
        ai_visible: f.ai_visible ?? true,
      };
      if (isNew) await api.post('/api/knowledge/articles', payload);
      else await api.patch(`/api/knowledge/articles/${draft.id}`, payload);
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <div className="kb-modal-bg" onClick={onClose}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-modal-head">
          <h3>{isNew ? 'Новая статья' : 'Изменить статью'}</h3>
          <button className="kb-icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <div className="kb-form">
          <label>Раздел
            <select value={f.category_id} onChange={e => set('category_id', Number(e.target.value))}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label>Заголовок
            <input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="Название элемента" />
          </label>
          <label>Краткое описание
            <textarea rows={2} value={f.summary || ''} onChange={e => set('summary', e.target.value)} placeholder="Одна-две строки сути" />
          </label>
          <label>Текст (Markdown)
            <textarea rows={8} className="mono" value={f.body || ''} onChange={e => set('body', e.target.value)} placeholder="Поддерживается Markdown: списки, **жирный**, заголовки…" />
          </label>
          <div className="kb-form-row">
            <label>Иконка
              <input list="kb-icons" value={f.icon_key || ''} onChange={e => set('icon_key', e.target.value)} placeholder="doc" />
              <datalist id="kb-icons">{ICON_HINTS.map(i => <option key={i} value={i} />)}</datalist>
            </label>
            <label>Ссылка в приложении
              <input value={f.route || ''} onChange={e => set('route', e.target.value)} placeholder="/clients" />
            </label>
            <label>Порядок
              <input type="number" value={f.sort_order ?? 0} onChange={e => set('sort_order', Number(e.target.value))} />
            </label>
          </div>
          <div className="kb-form-toggles">
            <label className="kb-check">
              <input type="checkbox" checked={f.is_published ?? true} onChange={e => set('is_published', e.target.checked)} />
              Опубликовано (видно всем)
            </label>
            <label className="kb-check">
              <input type="checkbox" checked={f.ai_visible ?? true} onChange={e => set('ai_visible', e.target.checked)} />
              Доступно ИИ-помощникам
            </label>
          </div>
        </div>
        <div className="kb-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={saving || !f.title?.trim()} onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

function CategoryModal({ draft, onClose, onSaved }: {
  draft: Partial<Category>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<Partial<Category>>(draft);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isNew = !draft.id;
  const set = (k: keyof Category, v: unknown) => setF(p => ({ ...p, [k]: v }));

  async function save() {
    if (!f.title?.trim()) return;
    setSaving(true); setErr('');
    try {
      const payload = {
        key: f.key || f.title!.toLowerCase().replace(/\s+/g, '-').replace(/[^a-zа-я0-9-]/gi, ''),
        title: f.title,
        description: f.description || null,
        icon_key: f.icon_key || null,
        layout: f.layout || 'cards',
        sort_order: f.sort_order ?? 0,
      };
      if (isNew) await api.post('/api/knowledge/categories', payload);
      else await api.patch(`/api/knowledge/categories/${draft.id}`, payload);
      onSaved();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Не удалось сохранить');
    } finally { setSaving(false); }
  }

  return (
    <div className="kb-modal-bg" onClick={onClose}>
      <div className="kb-modal sm" onClick={e => e.stopPropagation()}>
        <div className="kb-modal-head">
          <h3>{isNew ? 'Новый раздел' : 'Изменить раздел'}</h3>
          <button className="kb-icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
        </div>
        <div className="kb-form">
          <label>Название
            <input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="Например: Интеграции" />
          </label>
          <label>Описание
            <input value={f.description || ''} onChange={e => set('description', e.target.value)} placeholder="Необязательно" />
          </label>
          <div className="kb-form-row">
            <label>Иконка
              <input list="kb-icons" value={f.icon_key || ''} onChange={e => set('icon_key', e.target.value)} placeholder="book" />
              <datalist id="kb-icons">{ICON_HINTS.map(i => <option key={i} value={i} />)}</datalist>
            </label>
            <label>Вид
              <select value={f.layout || 'cards'} onChange={e => set('layout', e.target.value)}>
                {LAYOUTS.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
              </select>
            </label>
            <label>Порядок
              <input type="number" value={f.sort_order ?? 0} onChange={e => set('sort_order', Number(e.target.value))} />
            </label>
          </div>
          {err && <p className="kb-form-err">{err}</p>}
        </div>
        <div className="kb-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" disabled={saving || !f.title?.trim()} onClick={save}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}
