import Icon from '../Icon';
import type { Project } from '../../types/projects';

interface ProjectToolbarProps {
  project: Project;
}

export default function ProjectToolbar({ project }: ProjectToolbarProps) {
  return (
    <div className="project-toolbar">
      <div>
        <div className="project-toolbar-title">{project.name}</div>
        <div className="project-toolbar-sub">{project.client_name} · обновлено {project.updated_at_fmt}</div>
      </div>
      <div className="project-toolbar-actions">
        <button className="btn btn-ghost btn-sm" type="button">
          <Icon name="share" size={15} />Экспорт
        </button>
        <button className="btn btn-primary btn-sm" type="button">
          <Icon name="sparkle" size={15} />ИИ-анализ
        </button>
      </div>
    </div>
  );
}
