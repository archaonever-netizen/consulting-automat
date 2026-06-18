import Icon from '../Icon';
import type { Project } from '../../types/projects';
import type { ProjectSection } from './ProjectWorkspace';
import type { ProjectFrameworkCard } from './projectFrameworkCards';

interface ProjectLeftPanelProps {
  project: Project;
  sections: ProjectSection[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  frameworkCards: ProjectFrameworkCard[];
  activeCardId: string | null;
  onSelectFrameworkCard: (cardId: string) => void;
}

export default function ProjectLeftPanel({
  project,
  sections,
  activeSectionId,
  onSelectSection,
  frameworkCards,
  activeCardId,
  onSelectFrameworkCard,
}: ProjectLeftPanelProps) {
  return (
    <aside className="project-side project-left-panel">
      <div className="project-panel-title">Структура</div>
      {sections.map(section => (
        <button
          key={section.id}
          className={`project-tree-item${section.id === activeSectionId ? ' active' : ''}`}
          type="button"
          onClick={() => onSelectSection(section.id)}
        >
          <Icon name={section.icon} size={16} />
          <span>{section.label}</span>
        </button>
      ))}
      <div className="project-framework-block">
        <div className="project-panel-title project-framework-title">Фреймворк проекта</div>
        <div className="project-framework-list">
          {frameworkCards.map(card => (
            <button
              key={card.id}
              className={`project-tree-item${card.id === activeCardId ? ' active' : ''}`}
              type="button"
              onClick={() => onSelectFrameworkCard(card.id)}
            >
              <Icon name="template" size={16} />
              <span>{card.title}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="project-panel-note">
        {project.description || 'Добавьте описание проекта, чтобы команда быстрее понимала контекст.'}
      </div>
    </aside>
  );
}
