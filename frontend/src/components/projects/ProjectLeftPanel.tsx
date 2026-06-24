import Icon from '../Icon';
import type { Project } from '../../types/projects';
import type { ProjectSection } from './ProjectWorkspace';
import type { ProjectFrameworkCard } from './projectFrameworkCards';

interface ProjectLeftPanelProps {
  project: Project;
  sections: ProjectSection[];
  // Карточка-обзор «Весь проект» — отдельный пункт над структурными секциями.
  wholeProjectCardId: string;
  frameworkCards: ProjectFrameworkCard[];
  activeCardId: string;
  activeMode: 'edit' | 'compact';
  onSelectFrameworkCard: (cardId: string) => void;
  onSelectCompactCard: (cardId: string) => void;
  expandedSections: Set<string>;
  onToggleSection: (sectionId: string) => void;
}

export default function ProjectLeftPanel({
  project,
  sections,
  wholeProjectCardId,
  frameworkCards,
  activeCardId,
  activeMode,
  onSelectFrameworkCard,
  onSelectCompactCard,
  expandedSections,
  onToggleSection,
}: ProjectLeftPanelProps) {
  const cardById = new Map(frameworkCards.map(card => [card.id, card]));
  const wholeProjectCard = cardById.get(wholeProjectCardId);

  return (
    <aside className="project-side project-left-panel">
      <div className="project-panel-title">Структура проекта</div>

      {wholeProjectCard && (
        <button
          className={`project-tree-item${wholeProjectCard.id === activeCardId ? ' active' : ''}`}
          type="button"
          onClick={() => onSelectFrameworkCard(wholeProjectCard.id)}
        >
          <span>{wholeProjectCard.title}</span>
        </button>
      )}

      <div className="project-section-groups">
        {sections.map(section => {
          const expanded = expandedSections.has(section.id);
          const cards = section.cardIds
            .map(id => cardById.get(id))
            .filter((card): card is ProjectFrameworkCard => Boolean(card));
          return (
            <div className="project-section-group" key={section.id}>
              <button
                className="project-section-head"
                type="button"
                aria-expanded={expanded}
                onClick={() => onToggleSection(section.id)}
              >
                <Icon name="chevron" size={14} className={`project-section-chevron${expanded ? ' open' : ''}`} />
                <span>{section.label}</span>
              </button>
              {expanded && (
                <div className="project-section-cards">
                  {cards.length ? (
                    cards.map(card => (
                      <div
                        className={`project-tree-row${card.id === activeCardId ? ' active' : ''}${card.id === activeCardId && activeMode === 'compact' ? ' compact-active' : ''}`}
                        key={card.id}
                      >
                        <button
                          className={`project-tree-item project-tree-subitem${card.id === activeCardId ? ' active' : ''}`}
                          type="button"
                          onClick={() => onSelectFrameworkCard(card.id)}
                        >
                          <span>{card.title}</span>
                        </button>
                        <button
                          className="project-tree-compact-btn"
                          type="button"
                          onClick={() => onSelectCompactCard(card.id)}
                          title="Компазированный раздел"
                          aria-label={`Компазированный раздел: ${card.title}`}
                        >
                          <Icon name="book" size={14} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="project-section-empty">Раздел появится позже</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {project.description && (
        <div className="project-panel-note">{project.description}</div>
      )}
    </aside>
  );
}
