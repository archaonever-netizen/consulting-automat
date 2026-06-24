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
  description: string;
}

const PROJECT_SECTIONS: ProjectSection[] = [
  {
    id: 'goals',
    label: 'Цели проекта',
    icon: 'check',
    description: 'Здесь появятся ключевые цели, критерии успеха и ориентиры команды по проекту.',
  },
  {
    id: 'concept',
    label: 'Концепция проекта',
    icon: 'sparkle',
    description: 'Здесь появятся гипотезы, видение решения, ограничения и ценность проекта.',
  },
  {
    id: 'design',
    label: 'Проектирование',
    icon: 'template',
    description: 'Здесь появятся схемы, архитектурные решения и артефакты проектирования.',
  },
  {
    id: 'programming',
    label: 'Программирование',
    icon: 'bolt',
    description: 'Здесь появятся задачи разработки, технические заметки и ссылки на реализацию.',
  },
  {
    id: 'progress',
    label: 'Ход проекта',
    icon: 'trendUp',
    description: 'Здесь появятся статусы, события, риски и ближайшие шаги по проекту.',
  },
];

interface ProjectWorkspaceProps {
  project: Project;
}

export default function ProjectWorkspace({ project }: ProjectWorkspaceProps) {
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [activeCardId, setActiveCardId] = useState(PROJECT_FRAMEWORK_CARDS[0].id);
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
  const activeSection = activeSectionId
    ? PROJECT_SECTIONS.find(section => section.id === activeSectionId) || null
    : null;
  const activeFrameworkCard = PROJECT_FRAMEWORK_CARDS.find(card => card.id === activeCardId) || PROJECT_FRAMEWORK_CARDS[0];
  const canvasView = activeSection
    ? {
        icon: activeSection.icon,
        title: activeSection.label,
        description: activeSection.description,
      }
    : {
        icon: 'template',
        title: activeFrameworkCard.title,
        description: activeFrameworkCard.description,
        frameworkCardId: activeFrameworkCard.id,
      };

  function selectSection(sectionId: string) {
    setActiveSectionId(sectionId);
  }

  function selectFrameworkCard(cardId: string, focus?: { list?: string; itemId?: string }) {
    setActiveCardId(cardId);
    setActiveSectionId(null);
    setFocusTarget(focus ? { cardId, list: focus.list, itemId: focus.itemId, nonce: ++focusNonce.current } : null);
  }

  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} />
      <div className="project-workspace-grid" ref={gridRef} style={{ '--rp-width': `${rightWidth}px` } as React.CSSProperties}>
        <ProjectLeftPanel
          project={project}
          sections={PROJECT_SECTIONS}
          activeSectionId={activeSectionId}
          onSelectSection={selectSection}
          frameworkCards={PROJECT_FRAMEWORK_CARDS}
          activeCardId={activeSection ? null : activeFrameworkCard.id}
          onSelectFrameworkCard={selectFrameworkCard}
        />
        {hydrated ? (
          <ProjectCanvas
            projectId={project.id}
            view={canvasView}
            reloadNonce={reloadNonce}
            onSelectFrameworkCard={selectFrameworkCard}
            focusTarget={focusTarget}
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
          focusCardId={activeSection ? null : activeFrameworkCard.id}
          onProjectMutated={() => setReloadNonce(n => n + 1)}
        />
      </div>
    </div>
  );
}
