import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  portalApi, getToken, setToken, clearToken, PortalError,
  type PortalMe, type PortalData, type PortalDocument, type PortalProject,
  type PortalProjectField, type PortalProjectSection,
  type PortalStages, type PortalStatus, type PortalEvents, type PortalInfo,
} from './api';

const SECTION_LABEL: Record<string, string> = {
  project: 'Проект',
  stages: 'Этапы проекта',
  status: 'Статус проекта',
  documents: 'Документы и файлы',
  events: 'События',
  info: 'Информация',
  request: 'Оставить заявку',
};

// Иконки в едином стиле дизайн-системы ШЕФ (line, 24×24, stroke). Портал
// автономен, поэтому набор инлайнится здесь, а не импортируется из приложения.
const ICON_PATHS: Record<string, string> = {
  project: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M3.5 9h17"/><path d="M9 9v11.5"/>',
  stages: '<path d="M9 5h11"/><path d="M9 12h11"/><path d="M9 19h11"/><circle cx="4.5" cy="5" r="1.4"/><circle cx="4.5" cy="12" r="1.4"/><circle cx="4.5" cy="19" r="1.4"/>',
  status: '<path d="M3 12h4l2.5-7 5 14 2.5-7H21"/>',
  documents: '<path d="M6 2h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z"/><path d="M13 2v5h5"/>',
  events: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4M16 3v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.6h.01"/>',
  download: '<path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  request: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7Z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrowUp: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  arrowDown: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><path d="M4 22v-7"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.8-.9 1.4v.3"/><path d="M12 17h.01"/>',
};

function PlIcon({ name, size = 18 }: { name: string; size?: number }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }} />
  );
}

// Монограмма ШЕФ (тёмная плашка задаётся CSS-классом .pl-mono).
function ShefGlyph() {
  return (
    <svg viewBox="-20 -18 268 236" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#fff">
        <path d="M0 0H46V200H0Z" /><path d="M91 0H137V200H91Z" />
        <path d="M182 0H228V200H182Z" /><path d="M0 156H228V200H0Z" />
      </g>
      <path d="M188 156H228L184 200H144Z" fill="#2563EB" />
    </svg>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

type DocumentSectionKey = 'contract' | 'acts' | 'project_materials';

const DOCUMENT_SECTIONS: Array<{
  key: DocumentSectionKey;
  title: string;
  emptyText: string;
}> = [
  { key: 'contract', title: 'Договор с клиентом', emptyText: 'Договор с клиентом пока не добавлен.' },
  { key: 'acts', title: 'Акты', emptyText: 'Акты пока не добавлены.' },
  { key: 'project_materials', title: 'Материалы по проекту', emptyText: 'Материалов по проекту пока что нет.' },
];

function documentSectionKey(doc: PortalDocument): DocumentSectionKey {
  const title = doc.title.trim().toLowerCase();
  if (/приложени[ея]\s*(?:№\s*)?(?:1|2|1\s*,\s*2)/i.test(title) || title.includes('акт')) return 'acts';
  if (title.includes('агентский договор') || title.includes('договор')) return 'contract';
  return 'project_materials';
}

type Phase = 'loading' | 'login' | 'ready';

export default function PortalApp() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [data, setData] = useState<PortalData>({});
  const [active, setActive] = useState<string>('');
  const [activeProjectSectionKey, setActiveProjectSectionKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const projectNavItems = useMemo(() => buildProjectNavItems(data.project || []), [data.project]);
  const resolvedProjectSectionKey = projectNavItems.some(item => item.key === activeProjectSectionKey)
    ? activeProjectSectionKey
    : projectNavItems[0]?.key || '';
  const selectedProjectNavItem = active === 'project'
    ? projectNavItems.find(item => item.key === resolvedProjectSectionKey) || null
    : null;

  const loadAll = useCallback(async () => {
    setPhase('loading');
    setLoadError('');
    try {
      const meData = await portalApi.me();
      const payload = await portalApi.data();
      setMe(meData);
      setData(payload);
      // Начальный раздел: ?section=… (deep-link) → сохранённый → первый доступный.
      const wanted = new URLSearchParams(window.location.search).get('section');
      setActive(prev => {
        if (wanted && meData.sections.includes(wanted)) return wanted;
        return prev && meData.sections.includes(prev) ? prev : meData.sections[0] || '';
      });
      setPhase('ready');
    } catch (e) {
      if (e instanceof PortalError && e.status === 401) {
        setPhase('login');
      } else {
        setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setPhase('login');
      }
    }
  }, []);

  // Старт: подхватываем preview-токен из ?preview=..., иначе — сохранённый токен.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('preview');
    if (preview) {
      setToken(preview);
      params.delete('preview');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    const timer = window.setTimeout(() => {
      if (getToken()) {
        void loadAll();
      } else {
        setPhase('login');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAll]);

  function logout() {
    clearToken();
    setMe(null);
    setData({});
    setActiveProjectSectionKey('');
    setPhase('login');
  }

  function openSection(section: string) {
    setActive(section);
  }

  function openProjectSection(key: string) {
    setActive('project');
    setActiveProjectSectionKey(key);
  }

  if (phase === 'loading') {
    return <div className="pl-loading">Загрузка…</div>;
  }
  if (phase === 'login') {
    return <LoginScreen onSuccess={loadAll} initialError={loadError} />;
  }
  if (!me) return null;

  return (
    <div className="pl-shell">
      <div className="pl-topbar">
        <div className="pl-brand">
          <span className="pl-mono"><ShefGlyph /></span>
          <div className="pl-brand-text">
            <b>{me.client_name || 'Портал проекта'}</b>
            <small>Портал клиента</small>
          </div>
        </div>
        <div className="pl-topbar-right">
          <div className="pl-user">
            <b>{me.full_name}</b>
            {!me.is_preview && <span>сотрудник клиента</span>}
          </div>
          <button className="pl-btn pl-btn-ghost" onClick={logout}>
            <PlIcon name={me.is_preview ? 'close' : 'logout'} size={16} />
            {me.is_preview ? 'Закрыть' : 'Выйти'}
          </button>
        </div>
      </div>

      {me.is_preview && (
        <div className="pl-preview-banner">
          <PlIcon name="eye" size={15} />
          Режим предпросмотра — так портал видит клиент. Видны все разделы.
        </div>
      )}

      <div className="pl-body">
        <nav className="pl-nav">
          {me.sections.map(s => (
            <div className="pl-nav-entry" key={s}>
              <button
                className={`pl-nav-item${active === s ? ' active' : ''}`}
                onClick={() => openSection(s)}
              >
                <PlIcon name={s} size={18} />
                {SECTION_LABEL[s] || s}
              </button>
              {s === 'project' && active === 'project' && projectNavItems.length > 0 && (
                <div className="pl-nav-sub">
                  {projectNavItems.map(item => (
                    <button
                      key={item.key}
                      className={`pl-nav-subitem${resolvedProjectSectionKey === item.key ? ' active' : ''}`}
                      title={`${item.project.name} - ${item.section.title}`}
                      onClick={() => openProjectSection(item.key)}
                    >
                      <span className="pl-nav-sub-title">{item.section.title}</span>
                      <span className="pl-nav-sub-meta">{item.phase.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <main className="pl-main">
          <SectionView section={active} data={data} isPreview={me.is_preview} selectedProjectNavItem={selectedProjectNavItem} />
        </main>
      </div>

      <footer className="pl-foot">
        <span className="pl-mono sm"><ShefGlyph /></span>
        Портал клиента · работает на ШЕФ
      </footer>
    </div>
  );
}

function SectionView({
  section,
  data,
  isPreview,
  selectedProjectNavItem,
}: {
  section: string;
  data: PortalData;
  isPreview: boolean;
  selectedProjectNavItem?: ProjectNavItem | null;
}) {
  const title = SECTION_LABEL[section] || section;

  if (section === 'documents') {
    return <DocumentsSection docs={data.documents || []} />;
  }

  if (section === 'request') {
    return <RequestSection isPreview={isPreview} />;
  }

  if (section === 'stages' && data.stages && data.stages.items.length > 0) {
    return <StagesSection stages={data.stages} />;
  }
  if (section === 'status' && data.status) {
    return <StatusSection status={data.status} />;
  }
  if (section === 'events' && data.events && data.events.items.length > 0) {
    return <EventsSection events={data.events} />;
  }
  if (section === 'info' && data.info) {
    return <InfoSection info={data.info} />;
  }

  if (section === 'project') {
    const projects = data.project || [];
    return (
      <div className="pl-card">
        <h2 className="pl-h2">{title}</h2>
        <p className="pl-sub">Собранная логика и ключевые выводы по проектам вашей компании.</p>
        {projects.length === 0 ? (
          <Empty icon="project" title="Проектов пока нет" text="Здесь появятся проекты по мере их запуска." />
        ) : selectedProjectNavItem ? (
          <ProjectSelectedSection item={selectedProjectNavItem} />
        ) : (
          <ProjectSection projects={projects} />
        )}
      </div>
    );
  }

  // Разделы-скелеты: пока нет данных в системе.
  const placeholders: Record<string, string> = {
    stages: 'Этапы проекта появятся здесь по мере ведения работы.',
    status: 'Текущий статус проекта будет отображаться здесь.',
    events: 'Новости и важные события по проекту появятся здесь.',
    info: 'Справочная информация по проекту появится здесь.',
  };
  return (
    <div className="pl-card">
      <h2 className="pl-h2">{title}</h2>
      <Empty icon={section} title="Раздел в подготовке" text={placeholders[section] || 'Раздел скоро наполнится.'} />
    </div>
  );
}

// Фаза жизненного цикла проекта (порядок фронта совпадает с phase_order бэка).
interface PhaseGroup {
  key: string;
  label: string;
  summary: string;
  order: number;
  sections: PortalProjectSection[];
}

interface ProjectNavItem {
  key: string;
  project: PortalProject;
  phase: PhaseGroup;
  section: PortalProjectSection;
}

// Сгруппировать секции проекта по фазам, сохранив серверный порядок секций.
function groupSectionsByPhase(sections: PortalProjectSection[]): PhaseGroup[] {
  const byKey = new Map<string, PhaseGroup>();
  const order: string[] = [];
  for (const section of sections) {
    const key = section.phase || 'other';
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: section.phase_label || 'Прочее',
        summary: section.phase_summary || '',
        order: section.phase_order ?? 99,
        sections: [],
      });
      order.push(key);
    }
    byKey.get(key)!.sections.push(section);
  }
  return order
    .map(key => byKey.get(key)!)
    .sort((a, b) => a.order - b.order);
}

function buildProjectNavItems(projects: PortalProject[]): ProjectNavItem[] {
  return projects.flatMap(project => (
    groupSectionsByPhase(project.sections || []).flatMap(phase => (
      phase.sections.map(section => ({
        key: `${project.id}:${section.id}`,
        project,
        phase,
        section,
      }))
    ))
  ));
}

function ProjectSelectedSection({ item }: { item: ProjectNavItem }) {
  return (
    <article className="pl-proj pl-proj-single">
      <div className="pl-proj-head">
        <div>
          <h3>{item.project.name}</h3>
          {item.project.description && <p>{item.project.description}</p>}
        </div>
        <div className="meta">Обновлено: {item.project.updated_at_fmt}</div>
      </div>
      <div className="pl-phase-head pl-phase-head-compact">
        <h4>{item.phase.label}</h4>
        {item.phase.summary && <p>{item.phase.summary}</p>}
      </div>
      <SectionCard section={item.section} />
    </article>
  );
}

function ProjectSection({ projects }: { projects: PortalProject[] }) {
  return (
    <div className="pl-project-list">
      {projects.map(project => {
        const phases = groupSectionsByPhase(project.sections || []);
        return (
          <article key={project.id} className="pl-proj">
            <div className="pl-proj-head">
              <div>
                <h3>{project.name}</h3>
                {project.description && <p>{project.description}</p>}
              </div>
              <div className="meta">Обновлено: {project.updated_at_fmt}</div>
            </div>

            {phases.length === 0 ? (
              <div className="pl-project-empty">Готовые разделы проекта появятся здесь после сборки.</div>
            ) : (
              <div className="pl-phases">
                {phases.map(phase => (
                  <section className="pl-phase" key={`${project.id}:${phase.key}`}>
                    <div className="pl-phase-head">
                      <h4>{phase.label}</h4>
                      {phase.summary && <p>{phase.summary}</p>}
                    </div>
                    <div className="pl-phase-sections">
                      {phase.sections.map(section => (
                        <SectionCard key={section.id} section={section} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

// Один раздел: человеческая композиция в приоритете; структурные поля/группы —
// под «Подробнее». Если композиции нет — поля показываем сразу (fallback).
function SectionCard({ section }: { section: PortalProjectSection }) {
  const composition = (section.composition || '').trim();
  const hasDetails = section.fields.length > 0 || section.groups.length > 0;

  return (
    <article className="pl-sec">
      <h5 className="pl-sec-title">{section.title}</h5>
      {composition ? (
        <>
          <div className="pl-sec-body"><CompositionText text={composition} /></div>
          {hasDetails && (
            <details className="pl-sec-more">
              <summary>
                <span>Подробнее</span>
                <PlIcon name="chevron" size={15} />
              </summary>
              <div className="pl-sec-more-body">
                <SectionDetails section={section} />
              </div>
            </details>
          )}
        </>
      ) : (
        <div className="pl-sec-body">
          <SectionDetails section={section} />
        </div>
      )}
    </article>
  );
}

// Структурный вывод раздела (поля + группы) — fallback и содержимое «Подробнее».
function SectionDetails({ section }: { section: PortalProjectSection }) {
  return (
    <>
      {section.fields.length > 0 && (
        <dl className="pl-project-fields">
          {section.fields.map(field => (
            <ProjectField key={`${section.id}:field:${field.label}`} field={field} />
          ))}
        </dl>
      )}
      {section.groups.map(group => (
        <details className="pl-project-group" key={`${section.id}:group:${group.title}`}>
          <summary>
            <span>{group.title}</span>
            <PlIcon name="chevron" size={15} />
          </summary>
          <div className="pl-project-group-body">
            <div className="pl-project-items">
              {group.items.map(item => (
                <article className="pl-project-item" key={`${section.id}:${group.title}:${item.title}`}>
                  <h5>{item.title}</h5>
                  <dl className="pl-project-fields">
                    {item.fields.map(field => (
                      <ProjectField key={`${section.id}:${item.title}:${field.label}`} field={field} />
                    ))}
                  </dl>
                </article>
              ))}
            </div>
          </div>
        </details>
      ))}
    </>
  );
}

// ── Рендер композиции (лёгкий markdown без «ИИ-вида») ───────────────────────
// Портал автономен, поэтому парсер инлайнится здесь (тот же подход, что в
// ProjectWorkspace.tsx): заголовок = блок, **жирный** = элемент, «метка: значение» = поле.
type CompNode =
  | { kind: 'group'; text: string }
  | { kind: 'element'; text: string }
  | { kind: 'field'; label: string; value: string }
  | { kind: 'para'; text: string };

function renderInline(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

function parseComposition(text: string): CompNode[] {
  const strip = (s: string) => s.replace(/\*\*/g, '').trim();
  const nodes: CompNode[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (/^[-*_=]{3,}$/.test(line)) continue;
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) { nodes.push({ kind: 'group', text: strip(heading[2]) }); continue; }
    const bullet = /^(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) line = bullet[1].trim();
    const field =
      /^\*\*\s*([^*]+?)\s*:\s*\*\*\s*(.+)$/.exec(line) ||
      /^\*\*\s*([^*]+?)\s*\*\*\s*:\s*(.+)$/.exec(line) ||
      /^([^:*][^:]{0,40}):\s+(.+)$/.exec(line);
    const boldOnly = /^\*\*(.+?)\*\*$/.exec(line);
    if (field) nodes.push({ kind: 'field', label: strip(field[1]), value: strip(field[2]) });
    else if (boldOnly) nodes.push({ kind: 'element', text: boldOnly[1].trim() });
    else if (bullet) nodes.push({ kind: 'element', text: strip(line) });
    else nodes.push({ kind: 'para', text: line });
  }
  // Обычная строка прямо над полем — это имя элемента-родителя.
  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i].kind === 'para' && nodes[i + 1].kind === 'field') {
      nodes[i] = { kind: 'element', text: (nodes[i] as { text: string }).text };
    }
  }
  return nodes;
}

function CompositionText({ text }: { text: string }) {
  const nodes = parseComposition(text);
  if (nodes.length === 0) return null;
  return (
    <div className="pl-comp">
      {nodes.map((n, i) => {
        if (n.kind === 'group') return <p key={i} className="pl-comp-group">{n.text}</p>;
        if (n.kind === 'element') return <p key={i} className="pl-comp-el">{renderInline(n.text)}</p>;
        if (n.kind === 'field') {
          return (
            <p key={i} className="pl-comp-field">
              <span className="pl-comp-label">{n.label}:</span>{' '}
              <span>{renderInline(n.value)}</span>
            </p>
          );
        }
        return <p key={i} className="pl-comp-para">{renderInline(n.text)}</p>;
      })}
    </div>
  );
}

function textParts(value: string): { kind: 'list' | 'paragraphs'; items: string[] } {
  const normalized = value.replace(/\r/g, '').trim();
  if (!normalized) return { kind: 'paragraphs', items: [] };

  const lines = normalized.split(/\n+/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 1) return { kind: 'paragraphs', items: lines };

  const semicolonParts = normalized.split(/\s*;\s*/).map(part => part.trim()).filter(Boolean);
  if (semicolonParts.length > 1) return { kind: 'list', items: semicolonParts };

  if (normalized.length > 220) {
    const sentences = normalized.split(/(?<=[.!?])\s+(?=[А-ЯA-ZЁ0-9])/).map(part => part.trim()).filter(Boolean);
    if (sentences.length > 1) return { kind: 'paragraphs', items: sentences };
  }

  return { kind: 'paragraphs', items: [normalized] };
}

function EmphasizedText({ text }: { text: string }) {
  const cleaned = text.replace(/^[-•]\s*/, '').trim();
  const match = cleaned.match(/^([^:]{2,64}):\s+(.+)$/);
  if (!match || /^https?:\/\//i.test(match[1])) return <>{cleaned}</>;
  return <><strong>{match[1]}:</strong> {match[2]}</>;
}

function FormattedValue({ value }: { value: string }) {
  const parts = textParts(value);
  if (parts.items.length === 0) return null;
  if (parts.kind === 'list') {
    return (
      <ul className="pl-project-value-list">
        {parts.items.map((item, index) => (
          <li key={`${index}:${item.slice(0, 20)}`}><EmphasizedText text={item} /></li>
        ))}
      </ul>
    );
  }
  return (
    <div className="pl-project-value-text">
      {parts.items.map((part, index) => (
        <p key={`${index}:${part.slice(0, 20)}`}><EmphasizedText text={part} /></p>
      ))}
    </div>
  );
}

function ProjectField({ field }: { field: PortalProjectField }) {
  return (
    <div className="pl-project-field-row">
      <dt>{field.label}</dt>
      <dd><FormattedValue value={field.value} /></dd>
    </div>
  );
}

// ── Этапы проекта: вертикальный таймлайн-степпер ─────────────────────────────
const STAGE_STATUS_LABEL: Record<string, string> = {
  done: 'Завершён', active: 'В работе', upcoming: 'Впереди',
};

function StagesSection({ stages }: { stages: PortalStages }) {
  const doneCount = stages.items.filter(s => s.status === 'done').length;
  return (
    <div className="pl-card">
      <h2 className="pl-h2">Этапы проекта</h2>
      <p className="pl-sub">Путь проекта от диагностики до масштабирования — где мы сейчас и что впереди.</p>
      <div className="pl-stage-progress">
        <span className="pl-stage-progress-label">Пройдено этапов</span>
        <b>{doneCount} из {stages.items.length}</b>
      </div>
      <ol className="pl-timeline">
        {stages.items.map((s, i) => (
          <li key={i} className={`pl-tl-item ${s.status}`}>
            <span className="pl-tl-node">
              {s.status === 'done' ? <PlIcon name="check" size={13} /> : <span className="pl-tl-dot" />}
            </span>
            <div className="pl-tl-body">
              <div className="pl-tl-head">
                <b>{s.title}</b>
                <span className={`pl-pill pl-pill-${s.status === 'done' ? 'green' : s.status === 'active' ? 'blue' : 'gray'}`}>
                  <span className="led" />{STAGE_STATUS_LABEL[s.status]}
                </span>
              </div>
              <span className="pl-tl-period">{s.period}</span>
              <p className="pl-tl-text">{s.summary}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Статус проекта: сводка + кольцо прогресса + метрики + фокус ───────────────
function ProgressRing({ value }: { value: number }) {
  const r = 34, circ = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, value)) / 100 * circ;
  return (
    <svg className="pl-ring" viewBox="0 0 80 80" width={92} height={92}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--p-surface-2)" strokeWidth="8" />
      <circle
        cx="40" cy="40" r={r} fill="none" stroke="var(--p-accent)" strokeWidth="8"
        strokeLinecap="round" strokeDasharray={`${filled} ${circ - filled}`}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="45" textAnchor="middle" className="pl-ring-text">{value}%</text>
    </svg>
  );
}

function StatusSection({ status }: { status: PortalStatus }) {
  const healthCls = status.health === 'on_track' ? 'green' : status.health === 'at_risk' ? 'amber' : 'red';
  return (
    <div className="pl-card">
      <h2 className="pl-h2">Статус проекта</h2>
      <p className="pl-sub">Общее состояние проекта, ключевые метрики и ближайший шаг.</p>

      <div className="pl-status-hero">
        <ProgressRing value={status.progress} />
        <div className="pl-status-hero-main">
          <span className={`pl-pill pl-pill-${healthCls}`}><span className="led" />{status.health_label}</span>
          <b>{status.headline}</b>
          <p>{status.summary}</p>
        </div>
      </div>

      <div className="pl-metrics">
        {status.metrics.map((m, i) => (
          <div key={i} className="pl-metric">
            <span className="pl-metric-label">{m.label}</span>
            <b className="pl-metric-value">{m.value}</b>
            <span className={`pl-metric-delta ${m.positive ? 'pos' : 'neg'}`}>
              <PlIcon name={m.dir === 'down' ? 'arrowDown' : 'arrowUp'} size={13} />{m.delta}
            </span>
          </div>
        ))}
      </div>

      {status.next_step && (
        <div className="pl-next">
          <span className="pl-next-ic"><PlIcon name="target" size={18} /></span>
          <div className="pl-next-body">
            <span className="pl-next-kicker">Ближайший шаг</span>
            <b>{status.next_step.title}</b>
          </div>
          <span className="pl-next-due">{status.next_step.due}</span>
        </div>
      )}

      {status.focus.length > 0 && (
        <div className="pl-focus">
          <h3 className="pl-block-title">В фокусе сейчас</h3>
          <ul className="pl-focus-list">
            {status.focus.map((f, i) => (
              <li key={i}><PlIcon name="spark" size={15} /><span>{f}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── События: лента обновлений ────────────────────────────────────────────────
const EVENT_ICON: Record<string, string> = {
  milestone: 'flag', meeting: 'chat', update: 'spark', document: 'documents',
};

function EventsSection({ events }: { events: PortalEvents }) {
  return (
    <div className="pl-card">
      <h2 className="pl-h2">События</h2>
      <p className="pl-sub">Хроника проекта: важные вехи, встречи и обновления.</p>
      <div className="pl-feed">
        {events.items.map((e, i) => (
          <article key={i} className={`pl-feed-item ${e.type}`}>
            <span className="pl-feed-ic"><PlIcon name={EVENT_ICON[e.type] || 'spark'} size={17} /></span>
            <div className="pl-feed-body">
              <div className="pl-feed-head">
                <b>{e.title}</b>
                <span className="pl-feed-date">{e.date}</span>
              </div>
              <p>{e.text}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

// ── Информация: команда + факты + вопросы ────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

function InfoSection({ info }: { info: PortalInfo }) {
  return (
    <div className="pl-card">
      <h2 className="pl-h2">Информация</h2>
      <p className="pl-sub">Команда проекта, ключевые сведения и ответы на частые вопросы.</p>

      {info.team.length > 0 && (
        <div className="pl-info-block">
          <h3 className="pl-block-title">Команда проекта</h3>
          <div className="pl-team">
            {info.team.map((m, i) => (
              <div key={i} className="pl-team-card">
                <span className="pl-team-av">{initials(m.name)}</span>
                <div className="pl-team-main">
                  <b>{m.name}</b>
                  <span className="pl-team-role">{m.role}</span>
                  <a className="pl-team-contact" href={`mailto:${m.contact}`}>
                    <PlIcon name="mail" size={14} />{m.contact}
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {info.facts.length > 0 && (
        <div className="pl-info-block">
          <h3 className="pl-block-title">О проекте</h3>
          <dl className="pl-facts">
            {info.facts.map((f, i) => (
              <div key={i} className="pl-fact"><dt>{f.label}</dt><dd>{f.value}</dd></div>
            ))}
          </dl>
        </div>
      )}

      {info.faq.length > 0 && (
        <div className="pl-info-block">
          <h3 className="pl-block-title">Частые вопросы</h3>
          <div className="pl-faq">
            {info.faq.map((q, i) => (
              <details key={i} className="pl-faq-item">
                <summary>
                  <span className="pl-faq-q"><PlIcon name="help" size={16} />{q.q}</span>
                  <PlIcon name="chevron" size={15} />
                </summary>
                <p>{q.a}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentsSection({ docs }: { docs: PortalDocument[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const docsBySection = DOCUMENT_SECTIONS.map(section => ({
    ...section,
    docs: docs.filter(doc => documentSectionKey(doc) === section.key),
  }));

  async function download(doc: PortalDocument) {
    setBusyId(doc.id);
    setError('');
    try {
      await portalApi.download(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скачать файл');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pl-card">
      <h2 className="pl-h2">Документы и файлы</h2>
      <p className="pl-sub">Материалы, которые ваша команда проекта подготовила для вас.</p>
      {error && <div className="pl-error">{error}</div>}
      {docs.length === 0 ? (
        <Empty icon="documents" title="Документов пока нет" text="Здесь появятся файлы, которыми с вами поделится команда." />
      ) : (
        <div className="pl-doc-sections">
          {docsBySection.map(section => (
            <section key={section.key} className="pl-doc-section">
              <div className="pl-doc-section-head">
                <h3>{section.title}</h3>
                <span>{section.docs.length}</span>
              </div>
              {section.docs.length === 0 ? (
                <div className="pl-doc-empty">{section.emptyText}</div>
              ) : (
                section.docs.map(d => (
                  <div key={d.id} className="pl-item">
                    <span className="pl-item-ic"><PlIcon name="documents" size={19} /></span>
                    <div className="pl-item-main">
                      <b>{d.title}</b>
                      <span>
                        {d.source_type === 'yandex_disk' ? 'Яндекс Диск' : d.original_filename}
                        {' · '}
                        {d.source_type === 'yandex_disk' ? d.source_label : humanSize(d.size_bytes)}
                        {' · '}
                        {d.created_at_fmt}
                      </span>
                    </div>
                    <button className="pl-btn pl-btn-soft" disabled={busyId === d.id} onClick={() => download(d)}>
                      <PlIcon name="download" size={15} />
                      {busyId === d.id ? 'Скачивание…' : 'Скачать'}
                    </button>
                  </div>
                ))
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function RequestSection({ isPreview }: { isPreview: boolean }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await portalApi.submitRequest({
        subject: subject.trim(),
        message: message.trim(),
        contact: contact.trim() || undefined,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить заявку');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="pl-card">
        <h2 className="pl-h2">Оставить заявку</h2>
        <div className="pl-empty">
          <span className="pl-empty-ic pl-empty-ic-ok"><PlIcon name="check" size={24} /></span>
          <b>Заявка отправлена</b>
          <span>Команда проекта получила вашу заявку и свяжется с вами.</span>
          <button
            className="pl-btn pl-btn-soft pl-btn-inline"
            style={{ marginTop: 16 }}
            onClick={() => { setSent(false); setSubject(''); setMessage(''); setContact(''); }}
          >
            Оставить ещё одну
          </button>
        </div>
      </div>
    );
  }

  const canSubmit = !sending && !isPreview && subject.trim() !== '' && message.trim() !== '';

  return (
    <div className="pl-card">
      <h2 className="pl-h2">Оставить заявку</h2>
      <p className="pl-sub">Опишите вопрос или задачу — команда проекта получит заявку и свяжется с вами.</p>
      {isPreview && <div className="pl-note">Это предпросмотр: в режиме «Вид для клиента» заявка не отправляется.</div>}
      {error && <div className="pl-error">{error}</div>}
      <form onSubmit={submit}>
        <div className="pl-field">
          <label htmlFor="pl-subject">Тема</label>
          <input id="pl-subject" className="pl-input" value={subject} maxLength={200}
            onChange={e => setSubject(e.target.value)} required disabled={sending || isPreview}
            placeholder="Коротко о сути" />
        </div>
        <div className="pl-field">
          <label htmlFor="pl-message">Сообщение</label>
          <textarea id="pl-message" className="pl-input pl-textarea" value={message} maxLength={5000} rows={5}
            onChange={e => setMessage(e.target.value)} required disabled={sending || isPreview}
            placeholder="Подробности заявки" />
        </div>
        <div className="pl-field">
          <label htmlFor="pl-contact">Контакт для связи <span className="pl-opt">— необязательно</span></label>
          <input id="pl-contact" className="pl-input" value={contact} maxLength={255}
            onChange={e => setContact(e.target.value)} disabled={sending || isPreview}
            placeholder="Телефон или email, если удобнее другой способ" />
        </div>
        <button className="pl-btn pl-btn-primary pl-btn-inline" type="submit" disabled={!canSubmit}>
          <PlIcon name="request" size={16} />
          {sending ? 'Отправка…' : 'Отправить заявку'}
        </button>
      </form>
    </div>
  );
}

function Empty({ title, text, icon }: { title: string; text: string; icon?: string }) {
  return (
    <div className="pl-empty">
      {icon && <span className="pl-empty-ic"><PlIcon name={icon} size={24} /></span>}
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

function LoginScreen({ onSuccess, initialError }: { onSuccess: () => void; initialError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await portalApi.login(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pl-login">
      <form className="pl-login-card" onSubmit={submit}>
        <div className="pl-login-brand">
          <span className="pl-mono lg"><ShefGlyph /></span>
          <div>
            <b>ШЕФ</b>
            <span>Портал клиента</span>
          </div>
        </div>
        <h1>Вход в портал</h1>
        <p className="sub">Введите логин и пароль, которые вам выдала команда проекта.</p>
        {error && <div className="pl-error">{error}</div>}
        <div className="pl-field">
          <label htmlFor="pl-email">Email</label>
          <input id="pl-email" className="pl-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} required disabled={loading} autoComplete="username" />
        </div>
        <div className="pl-field">
          <label htmlFor="pl-pass">Пароль</label>
          <input id="pl-pass" className="pl-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
        </div>
        <button className="pl-btn pl-btn-primary" type="submit" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
