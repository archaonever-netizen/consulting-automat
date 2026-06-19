import { useEffect, useState } from 'react';
import type { Project } from '../../types/projects';
import ProjectCanvas from './ProjectCanvas';
import { seedFrameworkSectionSnapshots } from './ProjectFrameworkSectionCanvas';
import ProjectLeftPanel from './ProjectLeftPanel';
import { seedOkrSnapshot } from './ProjectOkrCanvas';
import ProjectRightPanel from './ProjectRightPanel';
import ProjectToolbar from './ProjectToolbar';
import { hydrateProjectCards } from './projectCardSync';
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

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    seedFrameworkSectionSnapshots(project.id);
    seedOkrSnapshot(project.id);
    hydrateProjectCards(project.id).finally(() => {
      if (!cancelled) setHydrated(true);
    });
    return () => {
      cancelled = true;
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

  function selectFrameworkCard(cardId: string) {
    setActiveCardId(cardId);
    setActiveSectionId(null);
  }

  return (
    <div className="project-workspace">
      <ProjectToolbar project={project} />
      <div className="project-workspace-grid">
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
          <ProjectCanvas projectId={project.id} view={canvasView} />
        ) : (
          <section className="project-canvas">
            <div className="project-canvas-empty">
              <span className="spinner" />
              <span>Загрузка данных проекта…</span>
            </div>
          </section>
        )}
        <ProjectRightPanel project={project} />
      </div>
    </div>
  );
}
