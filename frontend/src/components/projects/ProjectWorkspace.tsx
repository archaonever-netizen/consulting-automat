import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Project } from '../../types/projects';
import ProjectCanvas from './ProjectCanvas';
import ProjectDisclosure from './ProjectDisclosure';
import { seedFrameworkSectionSnapshots } from './ProjectFrameworkSectionCanvas';
import ProjectLeftPanel from './ProjectLeftPanel';
import { seedOkrSnapshot } from './ProjectOkrCanvas';
import ProjectRightPanel from './ProjectRightPanel';
import ProjectToolbar from './ProjectToolbar';
import { hydrateProjectCards } from './projectCardSync';
import type { CanvasFocusTarget } from './projectCanvasFocus';
import { buildCardValidationText } from './projectCardValidation';
import { buildCompactSectionModel, type CompactSectionModel } from './projectCompactSectionModel';

// Текст из компактной модели экрана (form-based) — запасной источник композиции для
// экранов, где производная проекция пуста (напр. Диагноз без открытого редактора).
// Формат (### блок / - элемент / Метка: значение) совпадает с тем, что ждут конвейер и рендер.
function compactModelToText(model: CompactSectionModel): string {
  const lines: string[] = [];
  for (const f of model.fields) lines.push(`${f.label}: ${f.value}`);
  for (const group of model.groups) {
    lines.push(`### ${group.title}`);
    for (const item of group.items) {
      lines.push(`- ${item.title}`);
      for (const f of item.fields) lines.push(`${f.label}: ${f.value}`);
    }
  }
  return lines.join('\n');
}
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import {
  fetchCompositionState,
  streamComposition,
  type CompositionBlockEvent,
  type CompositionBlockInput,
  type CompositionBlockStatus,
  type CompositionStageEvent,
  type CompositionState,
} from './projectReview';

// Шаг прогресса композиции по одному блоку (для степпера).
interface BlockStep { id: string; title: string; status: CompositionBlockStatus | 'skipped' }

// Разбить исходный текст экрана на блоки по строкам-заголовкам «### …»/«## …».
// id блока = его заголовок (стабилен между сборками) → правка одного блока меняет только его.
function splitIntoBlocks(text: string): CompositionBlockInput[] {
  const blocks: CompositionBlockInput[] = [];
  let cur: { id: string; title: string; lines: string[] } | null = null;
  const flush = () => {
    if (cur && cur.lines.join('\n').trim()) {
      blocks.push({ id: cur.id, title: cur.title, text: cur.lines.join('\n').trim() });
    }
  };
  for (const raw of text.split('\n')) {
    const h = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    if (h) {
      flush();
      const title = h[1].replace(/\*\*/g, '').trim();
      let id = title || `b${blocks.length}`;
      let k = 2;
      while (blocks.some(b => b.id === id)) id = `${title}-${k++}`; // защита от дублей заголовков
      cur = { id, title, lines: [] };
    } else {
      if (!cur) cur = { id: '_intro', title: '', lines: [] };
      cur.lines.push(raw);
    }
  }
  flush();
  return blocks;
}

// Статусы блоков по сохранённому чекпоинту (для гидрации после обновления страницы).
function blocksFromState(state: CompositionState): BlockStep[] {
  const order = state.order ?? [];
  const cache = state.block_cache ?? {};
  return order
    .map(id => ({ id, title: cache[id]?.title ?? '', status: 'done' as CompositionBlockStatus }))
    .filter(b => (cache[b.id]?.composition ?? '').trim().length > 0);
}

export interface ProjectSection {
  id: string;
  label: string;
  icon: string;
  // id карточек фреймворка (PROJECT_FRAMEWORK_CARDS), сгруппированных под этой секцией.
  cardIds: string[];
}

// Структурные секции левой панели. Группируют карточки фреймворка (id карточек неизменны —
// они используются графом, валидатором и применителем правок). «Весь проект» вынесен из секций
// отдельным пунктом сверху, поэтому здесь его нет.
const PROJECT_SECTIONS: ProjectSection[] = [
  {
    id: 'goal',
    label: 'Цель проекта',
    icon: 'check',
    cardIds: ['project-theory'],
  },
  {
    id: 'concept',
    label: 'Концепция проекта',
    icon: 'sparkle',
    cardIds: ['diagnosis', 'strategic-choice', 'target-state', 'strategy-map'],
  },
  {
    id: 'design',
    label: 'Проектирование',
    icon: 'template',
    cardIds: [],
  },
  {
    id: 'programming',
    label: 'Программирование',
    icon: 'bolt',
    cardIds: ['hypotheses', 'experiments', 'decisions', 'okr-kpi'],
  },
  {
    id: 'progress',
    label: 'Ход проекта',
    icon: 'trendUp',
    cardIds: ['initiatives', 'business-processes', 'tasks', 'facts-learning'],
  },
];

// Карточка-обзор «Весь проект» — отдельный пункт над структурными секциями.
const WHOLE_PROJECT_CARD_ID = 'whole-project';

const SECTION_BY_CARD_ID = new Map<string, string>(
  PROJECT_SECTIONS.flatMap(section => section.cardIds.map(cardId => [cardId, section.id])),
);

const ALL_SECTION_IDS = PROJECT_SECTIONS.map(section => section.id);
const COLLAPSED_STORAGE_KEY = 'project-sections-collapsed';

function readCollapsedSections(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? new Set(ids.filter((id: unknown): id is string => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

// Инлайновый разбор **жирного** внутри строки.
function renderInline(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

// Разбор композиции в 3 уровня: блок (group) → элемент (element) → поля (field).
// Цель — убрать «ИИ-вид» markdown (---, точки, **) и показать вложенность отступами.
type CompositionNode =
  | { kind: 'group'; text: string }
  | { kind: 'element'; text: string }
  | { kind: 'field'; label: string; value: string }
  | { kind: 'para'; text: string };

const stripStars = (s: string) => s.replace(/\*\*/g, '').trim();

function parseComposition(text: string): CompositionNode[] {
  const nodes: CompositionNode[] = [];
  for (const raw of text.split('\n')) {
    let line = raw.trim();
    if (!line) continue;
    if (/^[-*_=]{3,}$/.test(line)) continue;                       // горизонтальная линия → выкидываем
    // Любой markdown-заголовок в этой композиции = название блока (исходник отдаёт их
    // как «### Title»). Элементы приходят буллетами/жирным, а не заголовками.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      nodes.push({ kind: 'group', text: stripStars(heading[2]) });
      continue;
    }
    const bullet = /^(?:[-•*]|\d+[.)])\s+(.*)$/.exec(line);          // маркер/нумерация — снимаем
    if (bullet) line = bullet[1].trim();
    // Поле: «**Метка:** значение», «**Метка** : значение» или «Метка: значение» (короткая метка).
    const field =
      /^\*\*\s*([^*]+?)\s*:\s*\*\*\s*(.+)$/.exec(line) ||
      /^\*\*\s*([^*]+?)\s*\*\*\s*:\s*(.+)$/.exec(line) ||
      /^([^:*][^:]{0,40}):\s+(.+)$/.exec(line);
    const boldOnly = /^\*\*(.+?)\*\*$/.exec(line);
    if (field) {
      nodes.push({ kind: 'field', label: stripStars(field[1]), value: stripStars(field[2]) });
    } else if (boldOnly) {
      nodes.push({ kind: 'element', text: boldOnly[1].trim() });
    } else if (bullet) {
      nodes.push({ kind: 'element', text: stripStars(line) });       // пункт без «метка: значение» — это элемент
    } else {
      nodes.push({ kind: 'para', text: line });
    }
  }
  // Обычная строка прямо над полем — это на самом деле имя элемента (родитель).
  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i].kind === 'para' && nodes[i + 1].kind === 'field') {
      nodes[i] = { kind: 'element', text: (nodes[i] as { text: string }).text };
    }
  }
  return nodes;
}

function CompositionBody({ text }: { text: string }) {
  const nodes = parseComposition(text);
  return (
    <>
      {nodes.map((n, i) => {
        if (n.kind === 'group') return <p key={i} className="pc-group">{n.text}</p>;
        if (n.kind === 'element') return <p key={i} className="pc-element">{renderInline(n.text)}</p>;
        if (n.kind === 'field') {
          return (
            <p key={i} className="pc-field">
              <span className="pc-field-label">{n.label}:</span>{' '}
              <span className="pc-field-value">{renderInline(n.value)}</span>
            </p>
          );
        }
        return <p key={i} className="pc-para">{renderInline(n.text)}</p>;
      })}
    </>
  );
}

interface StoredProjectComposition {
  title: string;
  manifest: string;
  composition: string;
  savedAt: string;
}

const COMPOSITION_STORAGE_PREFIX = 'project-section-composition';

function compositionStorageKey(projectId: number, cardId: string): string {
  return `${COMPOSITION_STORAGE_PREFIX}:${projectId}:${cardId}`;
}

function writeStoredComposition(projectId: number, cardId: string, value: StoredProjectComposition) {
  try {
    localStorage.setItem(compositionStorageKey(projectId, cardId), JSON.stringify(value));
  } catch {
    // localStorage can be unavailable or full; composition still remains visible in current state.
  }
}

interface ProjectWorkspaceProps {
  project: Project;
}

type ActiveProjectView =
  | { mode: 'edit'; cardId: string }
  | { mode: 'compact'; cardId: string };

export default function ProjectWorkspace({ project }: ProjectWorkspaceProps) {
  const [activeView, setActiveView] = useState<ActiveProjectView>(() => ({
    mode: 'edit',
    cardId: PROJECT_FRAMEWORK_CARDS[0].id,
  }));
  // Раскрытые структурные секции дерева (сворачиваемые группы). По умолчанию раскрыты все,
  // кроме явно свёрнутых ранее (запоминаем в localStorage).
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const collapsed = readCollapsedSections();
    return new Set(ALL_SECTION_IDS.filter(id => !collapsed.has(id)));
  });
  // Гидрация из БD должна завершиться ДО монтирования канвасов, иначе они
  // инициализируют состояние из пустого localStorage и затрут серверные данные.
  const [hydrated, setHydrated] = useState(false);
  // Инкрементируется после применённой Методологом правки, чтобы перемонтировать
  // открытый канвас и подхватить свежий снапшот из localStorage.
  const [reloadNonce, setReloadNonce] = useState(0);
  // Цель центрирования канваса после двойного клика по узлу графа «Весь проект».
  const [focusTarget, setFocusTarget] = useState<CanvasFocusTarget | null>(null);
  const focusNonce = useRef(0);
  const [compositionOpen, setCompositionOpen] = useState(false);
  const [compositionManifest, setCompositionManifest] = useState('');
  const [compositionText, setCompositionText] = useState('');
  const [compositionSectionTitle, setCompositionSectionTitle] = useState('');
  const [compositionError, setCompositionError] = useState('');
  const [composingProject, setComposingProject] = useState(false);
  // Прогресс по блокам композиции (степпер): какой блок собирается / взят из кэша.
  const [blockSteps, setBlockSteps] = useState<BlockStep[]>([]);
  // Управление активным SSE-стримом (отмена при смене карточки/размонтировании).
  const composeAbortRef = useRef<AbortController | null>(null);

  // Ширина правой панели (чат Методолога) — тянется мышью, запоминается в localStorage.
  const RP_MIN = 300;
  const RP_MAX = 760;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [rightWidth, setRightWidth] = useState<number>(() => {
    const v = Number(localStorage.getItem('project-rp-width'));
    return v >= RP_MIN && v <= RP_MAX ? v : 360;
  });
  useEffect(() => {
    localStorage.setItem('project-rp-width', String(rightWidth));
  }, [rightWidth]);

  useEffect(() => {
    const collapsed = ALL_SECTION_IDS.filter(id => !expandedSections.has(id));
    localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsed));
  }, [expandedSections]);

  function toggleSection(sectionId: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (ev: MouseEvent) => {
      const rect = gridRef.current?.getBoundingClientRect();
      if (!rect) return;
      setRightWidth(Math.max(RP_MIN, Math.min(RP_MAX, rect.right - ev.clientX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  useEffect(() => {
    let cancelled = false;
    const resetTimer = window.setTimeout(() => {
      if (!cancelled) setHydrated(false);
    }, 0);
    seedFrameworkSectionSnapshots(project.id);
    seedOkrSnapshot(project.id);
    hydrateProjectCards(project.id).finally(() => {
      if (!cancelled) {
        window.clearTimeout(resetTimer);
        setHydrated(true);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(resetTimer);
    };
  }, [project.id]);
  const activeFrameworkCard = PROJECT_FRAMEWORK_CARDS.find(card => card.id === activeView.cardId) || PROJECT_FRAMEWORK_CARDS[0];
  const canvasView = {
    icon: 'template',
    title: activeFrameworkCard.title,
    description: activeFrameworkCard.description,
    frameworkCardId: activeFrameworkCard.id,
    mode: activeView.mode,
  };

  function revealFrameworkCard(cardId: string) {
    const sectionId = SECTION_BY_CARD_ID.get(cardId);
    if (sectionId) {
      setExpandedSections(prev => (prev.has(sectionId) ? prev : new Set(prev).add(sectionId)));
    }
  }

  function selectFrameworkCard(cardId: string, focus?: { list?: string; itemId?: string }) {
    setActiveView({ mode: 'edit', cardId });
    // Раскрываем секцию выбранной карточки, чтобы она была видна в дереве
    // (например, при переходе из узла графа «Весь проект»).
    revealFrameworkCard(cardId);
    setFocusTarget(focus ? { cardId, list: focus.list, itemId: focus.itemId, nonce: ++focusNonce.current } : null);
  }

  function selectCompactCard(cardId: string) {
    setActiveView({ mode: 'compact', cardId });
    revealFrameworkCard(cardId);
    setFocusTarget(null);
  }

  // Применить чекпоинт композиции из БД к UI (гидрация после обновления страницы/рестарта).
  function applyCompositionState(cardId: string, state: CompositionState) {
    const card = PROJECT_FRAMEWORK_CARDS.find(item => item.id === cardId);
    setCompositionSectionTitle(card?.title || '');
    setCompositionError(state.status === 'failed' && state.error ? state.error : '');
    setBlockSteps(blocksFromState(state));
    setCompositionManifest(state.final?.manifest ?? '');
    setCompositionText(state.final?.composition ?? '');
    if (state.status !== 'idle') setCompositionOpen(true);
    setComposingProject(false);
  }

  // Гидрация композиции при смене карточки: тянем чекпоинт из БД (переживает обновление
  // страницы и рестарт сервера). Текущий стрим при этом отменяем.
  useEffect(() => {
    const cardId = activeFrameworkCard.id;
    if (cardId === WHOLE_PROJECT_CARD_ID) return;
    composeAbortRef.current?.abort();
    let cancelled = false;
    fetchCompositionState(project.id, cardId)
      .then(state => { if (!cancelled) applyCompositionState(cardId, state); })
      .catch(() => { /* офлайн/первый заход — панель просто не открываем */ });
    return () => { cancelled = true; };
  }, [project.id, activeFrameworkCard.id]);

  // Отменить стрим при размонтировании воркспейса.
  useEffect(() => () => composeAbortRef.current?.abort(), []);

  // Обновить статус одного блока в степпере (приходит из SSE).
  function onCompositionBlock(event: CompositionBlockEvent) {
    setBlockSteps(prev => {
      const idx = prev.findIndex(b => b.id === event.id);
      const step: BlockStep = { id: event.id, title: event.title, status: event.status };
      if (idx === -1) return [...prev, step];
      const next = [...prev];
      next[idx] = step;
      return next;
    });
  }

  // Шаги полной сборки (review/finalize сильной моделью) — показываем тем же степпером.
  function onCompositionStage(event: CompositionStageEvent) {
    const titles: Record<string, string> = { review: 'Проверка (Opus)', finalize: 'Финальные правки' };
    setBlockSteps(prev => {
      const id = `stage:${event.stage}`;
      const step: BlockStep = { id, title: titles[event.stage] ?? event.stage, status: event.status };
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return [...prev, step];
      const next = [...prev];
      next[idx] = step;
      return next;
    });
  }

  // Два инструмента сборки:
  //  • mode='full' («Композиция раздела») — полная сборка всех блоков + проход Opus (review→finalize);
  //  • mode='incremental' («Обновить изменённое») — пересобираются ТОЛЬКО изменённые блоки
  //    (кэш по хешу на бэкенде), без Opus — дёшево, текст не «плывёт».
  async function runComposition(mode: 'incremental' | 'full' = 'full') {
    if (composingProject) return;
    const cardId = activeFrameworkCard.id;
    setCompositionOpen(true);
    setCompositionSectionTitle(activeFrameworkCard.title);
    setCompositionError('');
    if (cardId === WHOLE_PROJECT_CARD_ID) {
      setCompositionError('Выберите конкретный раздел проекта, чтобы собрать его композицию.');
      return;
    }
    // Источник — текстовый пересказ экрана из валидатора (buildCardValidationText): надёжно
    // покрывает «Теорию» (snap.blocks). Если проекция пуста (напр. Диагноз без открытого
    // редактора) — берём компактную form-модель как запас. Затем режем на блоки.
    let sectionText = buildCardValidationText(project.id, cardId).trim();
    if (!sectionText) {
      const compact = buildCompactSectionModel(project.id, cardId);
      if (compact) sectionText = compactModelToText(compact).trim();
    }
    const blocks = splitIntoBlocks(sectionText);
    if (!blocks.length) {
      setCompositionError('Для выбранного раздела пока нет данных для композиции.');
      return;
    }
    const projectModel = {
      project: {
        id: project.id,
        name: project.name,
        client_name: project.client_name,
        description: project.description || '',
      },
      section: { card_id: cardId, title: activeFrameworkCard.title },
      blocks,
    };

    setComposingProject(true);
    setBlockSteps([]);
    try {
      composeAbortRef.current?.abort();
      const ctrl = new AbortController();
      composeAbortRef.current = ctrl;
      await streamComposition(project.id, cardId, projectModel, {
        signal: ctrl.signal,
        onBlock: onCompositionBlock,
        onStage: onCompositionStage,
        onError: msg => setCompositionError(msg),
        onDone: section => {
          setCompositionManifest(section.manifest);
          setCompositionText(section.composition);
          writeStoredComposition(project.id, cardId, {
            title: activeFrameworkCard.title,
            manifest: section.manifest,
            composition: section.composition,
            savedAt: new Date().toISOString(),
          });
        },
      }, mode);
    } catch (e) {
      // Отмена (смена карточки/уход) — не ошибка; готовые блоки уже в БД.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setCompositionError('Не удалось собрать композицию раздела. Попробуйте ещё раз.');
      }
    } finally {
      setComposingProject(false);
    }
  }

  const showBlockSteps = composingProject || blockSteps.length > 0;

  const compositionSlot = compositionOpen ? (
    <ProjectDisclosure title={`Композиция раздела — ${compositionSectionTitle || activeFrameworkCard.title}`} defaultOpen>
      {compositionError && <div className="project-card-validator-error">{compositionError}</div>}

      {showBlockSteps && (
        <ol className="project-composition-steps">
          {blockSteps.map(step => (
            <li key={step.id} className={`project-composition-step is-${step.status}`}>
              <span className="project-composition-step-icon">
                {step.status === 'running'
                  ? <span className="spinner" />
                  : step.status === 'cached' ? '↺'
                  : step.status === 'fallback' ? '⚠'
                  : step.status === 'skipped' ? '–'
                  : '✓'}
              </span>
              <span className="project-composition-step-title">{step.title || 'Основное'}</span>
              {step.status === 'cached' && (
                <span className="project-composition-step-note">без изменений</span>
              )}
              {step.status === 'skipped' && (
                <span className="project-composition-step-note">правок не требуется</span>
              )}
              {step.status === 'fallback' && (
                <span className="project-composition-step-note">сбой — взят прежний текст</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {(compositionManifest || compositionText) && (
        <>
          {compositionManifest && (
            <div className="project-composition-manifest">
              <b>Манифест</b>
              <p>{compositionManifest}</p>
            </div>
          )}
          {compositionText && (
            <div className="project-composition-text">
              <CompositionBody text={compositionText} />
            </div>
          )}
        </>
      )}
    </ProjectDisclosure>
  ) : null;

  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} onComposeProject={() => runComposition('full')} onComposeIncremental={() => runComposition('incremental')} composingProject={composingProject} />
      <div className="project-workspace-grid" ref={gridRef} style={{ '--rp-width': `${rightWidth}px` } as React.CSSProperties}>
        <ProjectLeftPanel
          project={project}
          sections={PROJECT_SECTIONS}
          wholeProjectCardId={WHOLE_PROJECT_CARD_ID}
          frameworkCards={PROJECT_FRAMEWORK_CARDS}
          activeCardId={activeFrameworkCard.id}
          activeMode={activeView.mode}
          onSelectFrameworkCard={selectFrameworkCard}
          onSelectCompactCard={selectCompactCard}
          expandedSections={expandedSections}
          onToggleSection={toggleSection}
        />
        {hydrated ? (
          <ProjectCanvas
            projectId={project.id}
            view={canvasView}
            compositionSlot={compositionSlot}
            reloadNonce={reloadNonce}
            onSelectFrameworkCard={selectFrameworkCard}
            focusTarget={activeView.mode === 'edit' ? focusTarget : null}
          />
        ) : (
          <section className="project-canvas">
            <div className="project-canvas-empty">
              <span className="spinner" />
              <span>Загрузка данных проекта…</span>
            </div>
          </section>
        )}
        <div
          className="project-rp-resizer"
          onMouseDown={startResize}
          title="Потяните, чтобы изменить ширину панели"
        />
        <ProjectRightPanel
          projectId={project.id}
          focusCardId={activeFrameworkCard.id}
          onProjectMutated={() => setReloadNonce(n => n + 1)}
        />
      </div>
    </div>
  );
}
