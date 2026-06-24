import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../types/projects';
import Icon from '../Icon';
import ProjectCanvas from './ProjectCanvas';
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
  const [compositionText, setCompositionText] = useState('');
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
  }

  function selectCompactCard(cardId: string) {
    setActiveView({ mode: 'compact', cardId });
    revealFrameworkCard(cardId);
    setFocusTarget(null);
  }

  async function runProjectComposition() {
    if (composingProject) return;
    setCompositionOpen(true);
    setCompositionError('');
    setComposingProject(true);
    try {
      const result = await composeProject(project.id, {
        project: {
          id: project.id,
          name: project.name,
          client_name: project.client_name,
          description: project.description || '',
        },
        cards: buildProjectEditModel(project.id),
      });
      setCompositionText(result.composition || 'В проекте пока нет данных для композиции.');
    } catch {
      setCompositionError('Не удалось собрать композицию проекта. Попробуйте ещё раз.');
    } finally {
      setComposingProject(false);
    }
  }

  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} onComposeProject={runProjectComposition} composingProject={composingProject} />
      {compositionOpen && (
        <section className="project-composition-panel">
          <div className="project-composition-head">
            <div>
              <p className="eyebrow">Композиция проекта</p>
              <h2>Собранный текст проекта</h2>
            </div>
            <button
              type="button"
              className="project-composition-close"
              onClick={() => setCompositionOpen(false)}
              aria-label="Закрыть композицию"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
          {composingProject && (
            <div className="project-composition-loading">
              <span className="spinner" />
              Методолог собирает композицию проекта...
            </div>
          )}
          {compositionError && <div className="project-card-validator-error">{compositionError}</div>}
          {!composingProject && !compositionError && compositionText && (
            <div className="project-composition-text">
              {compositionLines(compositionText).map((line, index) => (
                <p key={`${index}:${line.slice(0, 16)}`}>{line}</p>
              ))}
            </div>
          )}
        </section>
      )}
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
