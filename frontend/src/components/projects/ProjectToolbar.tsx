import { Link } from 'react-router-dom';
import Icon from '../Icon';
import type { Project } from '../../types/projects';

interface ProjectToolbarProps {
  project: Project;
  onComposeProject?: () => void;        // полная сборка (с Opus)
  onComposeIncremental?: () => void;    // пересборка только изменённого
  composingProject?: boolean;
}

export default function ProjectToolbar({ project, onComposeProject, onComposeIncremental, composingProject = false }: ProjectToolbarProps) {
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
          className="btn btn-soft btn-sm"
          type="button"
          onClick={onComposeIncremental}
          disabled={!onComposeIncremental || composingProject}
          title="Пересобрать только изменённые блоки (быстро, без Opus)"
        >
          <Icon name="sparkle" size={15} />
          Обновить изменённое
        </button>
        <button
          className="btn btn-primary btn-sm"
          type="button"
          onClick={onComposeProject}
          disabled={!onComposeProject || composingProject}
          title="Полная сборка раздела: deepseek → sonnet → Opus → sonnet"
        >
          {composingProject ? <span className="spinner" /> : <Icon name="sparkle" size={15} />}
          Композиция раздела
        </button>
        <Link to={`/clients/${project.client_id}`} className="btn btn-ghost btn-sm">
          <Icon name="users" size={15} />Клиент
        </Link>
      </div>
    </div>
  );
}
