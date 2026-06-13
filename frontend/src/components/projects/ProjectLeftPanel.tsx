import Icon from '../Icon';
import type { Project } from '../../types/projects';

interface ProjectLeftPanelProps {
  project: Project;
}

export default function ProjectLeftPanel({ project }: ProjectLeftPanelProps) {
  return (
    <aside className="project-side project-left-panel">
      <div className="project-panel-title">Структура</div>
      <button className="project-tree-item active" type="button">
        <Icon name="template" size={16} />
        <span>Рабочая область</span>
      </button>
      <button className="project-tree-item" type="button">
        <Icon name="doc" size={16} />
        <span>Материалы проекта</span>
      </button>
      <button className="project-tree-item" type="button">
        <Icon name="check" size={16} />
        <span>Решения и задачи</span>
      </button>
      <div className="project-panel-note">
        {project.description || 'Добавьте описание проекта, чтобы команда быстрее понимала контекст.'}
      </div>
    </aside>
  );
}
