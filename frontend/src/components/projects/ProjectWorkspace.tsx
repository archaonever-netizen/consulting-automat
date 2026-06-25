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
import { buildProjectEditModel } from './projectEditModel';
import { buildCompactSectionModel } from './projectCompactSectionModel';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import {
  fetchCompositionState,
  resetComposition,
  streamComposition,
  type CompositionSection,
  type CompositionStageEvent,
  type CompositionStageKey,
  type CompositionState,
} from './projectReview';

// Этапы конвейера композиции — для прогресс-степпера (порядок = порядку выполнения).
type StageStatus = 'pending' | 'running' | 'done' | 'fallback' | 'skipped';
const COMPOSITION_STEPS: { key: CompositionStageKey; title: string }[] = [
  { key: 'collect', title: 'Сбор данных и черновик · DeepSeek' },
  { key: 'structure', title: 'Структурирование и ясный язык · Sonnet' },
  { key: 'review', title: 'Проверка и рекомендации · Opus' },
  { key: 'finalize', title: 'Финальные правки · Sonnet' },
];

function emptyStages(): Record<CompositionStageKey, StageStatus> {
  return { collect: 'pending', structure: 'pending', review: 'pending', finalize: 'pending' };
}

// Лучший доступный текст композиции из чекпоинта: финал → структурированный → черновик.
function bestSection(state: CompositionState): CompositionSection | null {
  return state.final ?? state.structured ?? state.draft ?? null;
}

// Статусы этапов по сохранённому чекпоинту (для паузы/гидрации после обновления страницы).
function stagesFromState(state: CompositionState): Record<CompositionStageKey, StageStatus> {
  return {
    collect: state.draft ? 'done' : 'pending',
    structure: state.structured ? 'done' : 'pending',
    review: state.recommendations ? 'done' : 'pending',
    finalize: state.final ? 'done' : 'pending',
  };
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

// Лёгкий markdown-рендер композиции: заголовки (##/###), маркированные списки (- • *),
// **жирный** и абзацы — чтобы текст читался структурно, а не сплошным полотном.
function CompositionBody({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;
  const flush = () => {
    if (bullets.length) {
      const items = bullets;
      blocks.push(
        <ul className="project-composition-list" key={`ul-${key++}`}>
          {items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
        </ul>,
      );
      bullets = [];
    }
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push(
        <p className={`project-composition-h project-composition-h${heading[1].length}`} key={`h-${key++}`}>
          {renderInline(heading[2])}
        </p>,
      );
    } else if (bullet) {
      bullets.push(bullet[1]);
    } else {
      flush();
      blocks.push(<p key={`p-${key++}`}>{renderInline(line)}</p>);
    }
  }
  flush();
  return <>{blocks}</>;
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
  // Прогресс по этапам конвейера композиции (для степпера) + рекомендации Opus.
  const [stageStatus, setStageStatus] = useState<Record<CompositionStageKey, StageStatus>>(emptyStages);
  const [reviewRecs, setReviewRecs] = useState<string[]>([]);
  // Незавершённый чекпоинт (частичная композиция) → доступна кнопка «Продолжить».
  const [compositionResumable, setCompositionResumable] = useState(false);
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
    setStageStatus(stagesFromState(state));
    setReviewRecs(state.recommendations?.recommendations ?? []);
    const best = bestSection(state);
    setCompositionManifest(best?.manifest ?? '');
    setCompositionText(best?.composition ?? '');
    // Частичный (или сбойный) чекпоинт → можно продолжить с незавершённого этапа.
    setCompositionResumable(!['idle', 'done'].includes(state.status));
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

  function onCompositionStage(event: CompositionStageEvent) {
    const next: StageStatus = event.status === 'running' ? 'running' : event.status;
    setStageStatus(prev => ({ ...prev, [event.stage]: next }));
    if (event.stage === 'review' && event.recommendations) setReviewRecs(event.recommendations);
  }

  // Запустить (fresh=true: «с нуля», сброс чекпоинта) или продолжить (fresh=false) композицию.
  async function runComposition(fresh: boolean) {
    if (composingProject) return;
    const cardId = activeFrameworkCard.id;
    setCompositionOpen(true);
    setCompositionSectionTitle(activeFrameworkCard.title);
    setCompositionError('');
    if (cardId === WHOLE_PROJECT_CARD_ID) {
      setCompositionError('Выберите конкретный раздел проекта, чтобы собрать его композицию.');
      return;
    }
    // Источник — компактный пересказ экрана (только заполненные поля/элементы, без
    // плейсхолдеров и без массивов options). Это чинит сложные экраны вроде «Теории»
    // и резко экономит токены. Для неередактируемых карточек берём текст-контекст.
    const compact = buildCompactSectionModel(project.id, cardId);
    const contextCard = buildProjectEditModel(project.id).context_cards.find(card => card.card_id === cardId);
    const hasCompact = !!compact && (compact.fields.length > 0 || compact.groups.length > 0);
    const contextText = contextCard?.text?.trim() ?? '';
    if (!hasCompact && !contextText) {
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
      compact: hasCompact ? compact : null,
      context_text: contextText,
    };

    setComposingProject(true);
    setCompositionResumable(false);
    try {
      if (fresh) {
        await resetComposition(project.id, cardId);
        setStageStatus(emptyStages());
        setReviewRecs([]);
        setCompositionManifest('');
        setCompositionText('');
      }
      composeAbortRef.current?.abort();
      const ctrl = new AbortController();
      composeAbortRef.current = ctrl;
      await streamComposition(project.id, cardId, projectModel, {
        signal: ctrl.signal,
        onStage: onCompositionStage,
        onError: msg => setCompositionError(msg),
        onDone: section => {
          setCompositionManifest(section.manifest);
          setCompositionText(section.composition);
          setCompositionResumable(false);
          writeStoredComposition(project.id, cardId, {
            title: activeFrameworkCard.title,
            manifest: section.manifest,
            composition: section.composition,
            savedAt: new Date().toISOString(),
          });
        },
      });
    } catch (e) {
      // Отмена (смена карточки/уход) — не ошибка; чекпоинт уже в БД, продолжим позже.
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setCompositionError('Не удалось собрать композицию раздела. Попробуйте ещё раз.');
        setCompositionResumable(true);
      }
    } finally {
      setComposingProject(false);
    }
  }

  const hasStageProgress = composingProject || compositionResumable
    || Object.values(stageStatus).some(s => s !== 'pending');

  const compositionSlot = compositionOpen ? (
    <ProjectDisclosure title={`Композиция раздела — ${compositionSectionTitle || activeFrameworkCard.title}`} defaultOpen>
      {compositionError && <div className="project-card-validator-error">{compositionError}</div>}

      {hasStageProgress && (
        <ol className="project-composition-steps">
          {COMPOSITION_STEPS.map(step => {
            const st = stageStatus[step.key];
            return (
              <li key={step.key} className={`project-composition-step is-${st}`}>
                <span className="project-composition-step-icon">
                  {st === 'running'
                    ? <span className="spinner" />
                    : st === 'done' ? '✓'
                    : st === 'fallback' ? '⚠'
                    : st === 'skipped' ? '–'
                    : '○'}
                </span>
                <span className="project-composition-step-title">{step.title}</span>
                {st === 'fallback' && (
                  <span className="project-composition-step-note">сбой этапа — взят текст предыдущего</span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {reviewRecs.length > 0 && (
        <div className="project-composition-recs">
          <b>Рекомендации рецензента</b>
          <ul>
            {reviewRecs.map((rec, i) => <li key={`${i}:${rec.slice(0, 16)}`}>{rec}</li>)}
          </ul>
        </div>
      )}

      {compositionResumable && !composingProject && (
        <button type="button" className="project-card-validator-btn" onClick={() => runComposition(false)}>
          Продолжить сборку
        </button>
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
      <ProjectToolbar project={project} onComposeProject={() => runComposition(true)} composingProject={composingProject} />
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
