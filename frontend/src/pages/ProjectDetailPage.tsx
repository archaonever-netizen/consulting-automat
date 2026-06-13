import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Icon from '../components/Icon';
import ProjectWorkspace from '../components/projects/ProjectWorkspace';
import api from '../services/api';
import type { Project } from '../types/projects';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading, isError } = useQuery<Project>({
    queryKey: ['projects', projectId],
    queryFn: async () => (await api.get(`/api/projects/${projectId}`)).data,
    enabled: !!projectId,
  });

  if (isLoading) return <div className="page"><div className="loading-bar"></div></div>;

  if (isError || !project) {
    return (
      <div className="page">
        <div className="empty-tab">
          <div className="ei"><Icon name="template" size={24} /></div>
          <b>Проект не найден</b>
          <span>Возможно, он был удалён или ссылка устарела.</span>
          <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => navigate('/projects')}>
            Вернуться к проектам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page project-detail-page">
      <div className="detail-top">
        <Link to="/projects" className="back"><Icon name="arrowLeft" size={18} />Проекты</Link>
        <div className="detail-top-actions">
          <Link to={`/clients/${project.client_id}`} className="btn btn-ghost btn-sm">
            <Icon name="users" size={16} />Карточка клиента
          </Link>
        </div>
      </div>
      <ProjectWorkspace project={project} />
    </div>
  );
}
