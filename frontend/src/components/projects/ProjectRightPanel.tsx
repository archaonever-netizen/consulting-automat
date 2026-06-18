import Icon from '../Icon';
import type { Project } from '../../types/projects';

interface ProjectRightPanelProps {
  project: Project;
}

export default function ProjectRightPanel({ project }: ProjectRightPanelProps) {
  return (
    <aside className="project-side project-right-panel">
      <div className="project-panel-title">Инспектор</div>
      <div className="project-inspector-block">
        <span>Клиент</span>
        <b>{project.client_name}</b>
      </div>
      <div className="project-inspector-block">
        <span>Создан</span>
        <b>{project.created_at_fmt}</b>
      </div>
      <div className="project-inspector-block">
        <span>Обновлён</span>
        <b>{project.updated_at_fmt}</b>
      </div>
      <button className="project-inspector-action" type="button">
        <Icon name="gear" size={16} />
        Настройки проекта
      </button>
    </aside>
  );
}
