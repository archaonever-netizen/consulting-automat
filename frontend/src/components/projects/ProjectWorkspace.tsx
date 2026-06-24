import { useEffect, useRef, useState } from 'react';
import type { Project } from '../../types/projects';
import ProjectCanvas from './ProjectCanvas';
import { seedFrameworkSectionSnapshots } from './ProjectFrameworkSectionCanvas';
import ProjectLeftPanel from './ProjectLeftPanel';
import { seedOkrSnapshot } from './ProjectOkrCanvas';
import ProjectRightPanel from './ProjectRightPanel';
import ProjectToolbar from './ProjectToolbar';
import { hydrateProjectCards } from './projectCardSync';
import type { CanvasFocusTarget } from './projectCanvasFocus';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';

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

  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} />
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
