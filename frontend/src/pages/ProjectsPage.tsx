import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Icon from '../components/Icon';
import ProjectFormModal from '../components/ProjectFormModal';
import api from '../services/api';
import type { Project, ProjectClientOption } from '../types/projects';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const { data: projects = [], isLoading: projectsLoading, isError: projectsError } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => (await api.get('/api/projects')).data,
  });
  const { data: clients = [], isLoading: clientsLoading } = useQuery<ProjectClientOption[]>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/api/clients')).data,
  });

  async function createProject(payload: { name: string; client_id: number; description: string | null }) {
    const response = await api.post('/api/projects', payload);
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    setModalOpen(false);
    navigate(`/projects/${response.data.id}`);
  }

  const search = query.trim().toLowerCase();
  const filtered = projects.filter(project => (
    !search
    || project.name.toLowerCase().includes(search)
    || project.client_name.toLowerCase().includes(search)
    || (project.description || '').toLowerCase().includes(search)
  ));

  if (projectsLoading || clientsLoading) {
    return <div className="page"><div className="loading-bar"></div></div>;
  }

  return (
    <div className="page projects-page">
      <div className="page-head rise">
        <div>
          <h1>Проекты</h1>
          <p>Рабочие пространства проектирования, привязанные к клиентам.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setModalOpen(true)} disabled={clients.length === 0}>
            <Icon name="plus" size={17} />Создать проект
          </button>
        </div>
      </div>

      <div className="toolbar rise d1">
        <div className="search">
          <Icon name="search" size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по проекту или клиенту..." />
        </div>
      </div>

      {projectsError && (
        <div className="project-error">
          Не удалось загрузить проекты. Проверьте соединение с backend и попробуйте обновить страницу.
        </div>
      )}

      {!projectsError && clients.length === 0 && (
        <div className="empty-tab">
          <div className="ei"><Icon name="users" size={24} /></div>
          <b>Сначала нужен клиент</b>
          <span>Проект нельзя создать без привязки к клиенту.</span>
          <Link to="/clients" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>
            <Icon name="plus" size={15} />Добавить клиента
          </Link>
        </div>
      )}

      {!projectsError && clients.length > 0 && filtered.length === 0 && (
        <div className="empty-tab">
          <div className="ei"><Icon name="template" size={24} /></div>
          <b>{projects.length === 0 ? 'Пока нет проектов' : 'Ничего не найдено'}</b>
          <span>{projects.length === 0 ? 'Создайте первый проект и привяжите его к клиенту.' : 'Измените поисковый запрос.'}</span>
          {projects.length === 0 && (
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => setModalOpen(true)}>
              <Icon name="plus" size={15} />Создать проект
            </button>
          )}
        </div>
      )}

      {!projectsError && filtered.length > 0 && (
        <div className="projects-grid">
          {filtered.map((project, i) => (
            <article key={project.id} className={`project-card rise d${Math.min(i + 1, 6)}`}>
              <div className="project-card-head">
                <span className="project-icon"><Icon name="template" size={19} /></span>
                <div className="project-card-title">
                  <h3>{project.name}</h3>
                  <Link to={`/clients/${project.client_id}`} onClick={e => e.stopPropagation()}>{project.client_name}</Link>
                </div>
              </div>
              <p>{project.description || 'Описание проекта пока не добавлено.'}</p>
              <div className="project-card-foot">
                <span>Обновлено: {project.updated_at_fmt}</span>
                <button className="btn btn-soft btn-sm" onClick={() => navigate(`/projects/${project.id}`)}>
                  Открыть <Icon name="arrowRight" size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <ProjectFormModal
          clients={clients}
          onClose={() => setModalOpen(false)}
          onSubmit={createProject}
        />
      )}
    </div>
  );
}
