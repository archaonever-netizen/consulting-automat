import { Link } from 'react-router-dom';
import Icon from '../Icon';
import type { Project } from '../../types/projects';

interface ProjectToolbarProps {
  project: Project;
  onComposeProject?: () => void;
  composingProject?: boolean;
}

export default function ProjectToolbar({ project, onComposeProject, composingProject = false }: ProjectToolbarProps) {
  return (
    <div className="project-toolbar">
      <div className="project-toolbar-main">
        <Link to="/projects" className="project-toolbar-back" aria-label="Вернуться к проектам">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div className="project-toolbar-heading">
          <div className="project-toolbar-title">{project.name}</div>
          <div className="project-toolbar-sub">{project.client_name} · обновлено {project.updated_at_fmt}</div>
        </div>
      </div>
      <div className="project-toolbar-actions">
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={onComposeProject}
          disabled={!onComposeProject || composingProject}
        >
          {composingProject ? <span className="spinner" /> : <Icon name="sparkle" size={15} />}
          Композиция проекта
        </button>
        <Link to={`/clients/${project.client_id}`} className="btn btn-ghost btn-sm">
          <Icon name="users" size={15} />Клиент
        </Link>
      </div>
    </div>
  );
}
