import { useEffect, useRef, useState } from 'react';
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
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import { composeProject } from './projectReview';

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

function compositionLines(text: string): string[] {
  return text
    .replace(/\*\*/g, '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
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

function readStoredComposition(projectId: number, cardId: string): StoredProjectComposition | null {
  try {
    const raw = localStorage.getItem(compositionStorageKey(projectId, cardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProjectComposition>;
    const composition = typeof parsed.composition === 'string' ? parsed.composition : '';
    const manifest = typeof parsed.manifest === 'string' ? parsed.manifest : '';
    if (!composition && !manifest) return null;
    return {
      title: typeof parsed.title === 'string' ? parsed.title : '',
      manifest,
      composition,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch {
    return null;
  }
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
    syncCompositionForCard(cardId);
  }

  function selectCompactCard(cardId: string) {
    setActiveView({ mode: 'compact', cardId });
    revealFrameworkCard(cardId);
    setFocusTarget(null);
    syncCompositionForCard(cardId);
  }

  function syncCompositionForCard(cardId: string) {
    if (!compositionOpen) return;
    const card = PROJECT_FRAMEWORK_CARDS.find(item => item.id === cardId);
    const stored = readStoredComposition(project.id, cardId);
    setCompositionSectionTitle(stored?.title || card?.title || '');
    setCompositionManifest(stored?.manifest || '');
    setCompositionText(stored?.composition || '');
    setCompositionError('');
    setComposingProject(false);
    if (!stored) setCompositionOpen(false);
  }

  async function runProjectComposition() {
    if (composingProject) return;
    const stored = readStoredComposition(project.id, activeFrameworkCard.id);
    setCompositionOpen(true);
    setCompositionManifest(stored?.manifest || '');
    setCompositionText(stored?.composition || '');
    setCompositionSectionTitle(stored?.title || activeFrameworkCard.title);
    setCompositionError('');
    if (activeFrameworkCard.id === WHOLE_PROJECT_CARD_ID) {
      setCompositionError('Выберите конкретный раздел проекта, чтобы собрать его композицию.');
      return;
    }
    setComposingProject(true);
    try {
      const fullModel = buildProjectEditModel(project.id);
      const editableCard = fullModel.editable_cards.find(card => card.card_id === activeFrameworkCard.id);
      const contextCard = fullModel.context_cards.find(card => card.card_id === activeFrameworkCard.id);
      if (!editableCard && !contextCard) {
        setCompositionError('Для выбранного раздела пока нет данных для композиции.');
        return;
      }
      const result = await composeProject(project.id, {
        project: {
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          description: project.description || '',
        },
        section: {
          card_id: activeFrameworkCard.id,
          title: activeFrameworkCard.title,
        },
        cards: {
          editable_cards: editableCard ? [editableCard] : [],
          context_cards: contextCard ? [contextCard] : [],
        },
      });
      const nextComposition = result.composition || 'В разделе пока нет данных для композиции.';
      const nextManifest = result.manifest || '';
      setCompositionManifest(nextManifest);
      setCompositionText(nextComposition);
      writeStoredComposition(project.id, activeFrameworkCard.id, {
        title: activeFrameworkCard.title,
        manifest: nextManifest,
        composition: nextComposition,
        savedAt: new Date().toISOString(),
      });
    } catch {
      setCompositionError('Не удалось собрать композицию раздела. Попробуйте ещё раз.');
    } finally {
      setComposingProject(false);
    }
  }

  const compositionSlot = compositionOpen ? (
    <ProjectDisclosure title={`Композиция раздела — ${compositionSectionTitle || activeFrameworkCard.title}`} defaultOpen>
      {composingProject && (
        <div className="project-composition-loading">
          <span className="spinner" />
          Методолог собирает композицию раздела...
        </div>
      )}
      {compositionError && <div className="project-card-validator-error">{compositionError}</div>}
      {!composingProject && !compositionError && (compositionManifest || compositionText) && (
        <>
          {compositionManifest && (
            <div className="project-composition-manifest">
              <b>Манифест</b>
              <p>{compositionManifest}</p>
            </div>
          )}
          {compositionText && (
            <div className="project-composition-text">
              {compositionLines(compositionText).map((line, index) => (
                <p key={`${index}:${line.slice(0, 16)}`}>{line}</p>
              ))}
            </div>
          )}
        </>
      )}
    </ProjectDisclosure>
  ) : null;

  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} onComposeProject={runProjectComposition} composingProject={composingProject} />
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
