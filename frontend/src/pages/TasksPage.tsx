import { useState, useEffect } from 'react';
import api from '../services/api';

interface Task {
  id: number;
  title: string;
  client_id: number;
  status: string;
  start_time?: string;
  duration_minutes?: number;
  goal?: string;
  action_description?: string;
  expected_result?: string;
  created_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#9ca3af',
  in_progress: '#3b82f6',
  completed: '#10b981',
  failed: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'В ожидании',
  in_progress: 'В процессе',
  completed: 'Завершена',
  failed: 'Ошибка',
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    api
      .get('/api/tasks')
      .then(r => {
        setTasks(r.data);
        if (r.data.length > 0) {
          setSelectedTask(r.data[0]);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const getStatusColor = (status: string) => STATUS_COLORS[status] || '#9ca3af';
  const getStatusLabel = (status: string) => STATUS_LABELS[status] || status;

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-header rise">
        <div>
          <h1 className="text-h1">Задачи</h1>
          <p className="text-body">Список задач с детальным просмотром</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary">Создать задачу</button>
        </div>
      </div>

      <div className="tasks-split-panel">
        {/* Left Panel - Task List */}
        <div className="tasks-panel-left">
          {tasks.length === 0 ? (
            <div className="empty-state">
              <p>Нет задач. Создайте новую для начала.</p>
            </div>
          ) : (
            <div className="tasks-list">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className={`task-item ${selectedTask?.id === t.id ? 'active' : ''}`}
                  onClick={() => setSelectedTask(t)}
                >
                  <div className="task-item-header">
                    <h4 className="task-item-title">{t.title}</h4>
                    <div
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(t.status) }}
                      title={getStatusLabel(t.status)}
                    >
                      <span className="status-dot" />
                    </div>
                  </div>
                  <p className="task-item-meta">
                    {new Date(t.created_at).toLocaleDateString('ru-RU', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Panel - Task Detail */}
        <div className="tasks-panel-right">
          {selectedTask ? (
            <div className="task-detail">
              <div className="detail-header">
                <h2 className="detail-title">{selectedTask.title}</h2>
                <div
                  className="detail-status"
                  style={{ backgroundColor: getStatusColor(selectedTask.status) }}
                >
                  {getStatusLabel(selectedTask.status)}
                </div>
              </div>

              <div className="detail-body">
                {/* Goal Section */}
                {selectedTask.goal && (
                  <div className="detail-section">
                    <h3 className="section-title">Цель</h3>
                    <p className="section-content">{selectedTask.goal}</p>
                  </div>
                )}

                {/* Action Description Section */}
                {selectedTask.action_description && (
                  <div className="detail-section">
                    <h3 className="section-title">Описание действия</h3>
                    <p className="section-content">
                      {selectedTask.action_description}
                    </p>
                  </div>
                )}

                {/* Expected Result Section */}
                {selectedTask.expected_result && (
                  <div className="detail-section">
                    <h3 className="section-title">Ожидаемый результат</h3>
                    <p className="section-content">
                      {selectedTask.expected_result}
                    </p>
                  </div>
                )}

                {/* Metadata */}
                <div className="detail-section">
                  <h3 className="section-title">Детали</h3>
                  <div className="metadata-grid">
                    <div className="metadata-item">
                      <span className="metadata-label">ID</span>
                      <span className="metadata-value">#{selectedTask.id}</span>
                    </div>
                    <div className="metadata-item">
                      <span className="metadata-label">Дата создания</span>
                      <span className="metadata-value">
                        {new Date(selectedTask.created_at).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    {selectedTask.start_time && (
                      <div className="metadata-item">
                        <span className="metadata-label">Начало</span>
                        <span className="metadata-value">
                          {new Date(selectedTask.start_time).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    )}
                    {selectedTask.duration_minutes && (
                      <div className="metadata-item">
                        <span className="metadata-label">Длительность</span>
                        <span className="metadata-value">
                          {selectedTask.duration_minutes} мин
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="detail-actions">
                <button className="btn btn-secondary">Редактировать</button>
                <button className="btn btn-secondary">Завершить</button>
              </div>
            </div>
          ) : (
            <div className="empty-detail">
              <p>Выберите задачу из списка</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .tasks-split-panel {
          display: grid;
          grid-template-columns: 350px 1fr;
          gap: 1rem;
          height: calc(100vh - 300px);
          min-height: 500px;
          margin-top: 1rem;
        }

        .tasks-panel-left,
        .tasks-panel-right {
          background: var(--bg-secondary, #f9f9f9);
          border-radius: var(--radius-md, 8px);
          border: 1px solid var(--border-color, #e0e0e0);
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .tasks-list {
          overflow-y: auto;
          flex: 1;
        }

        .task-item {
          padding: 1rem;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
          cursor: pointer;
          transition: all 0.2s ease;
          background: transparent;
        }

        .task-item:hover {
          background: var(--bg-tertiary, #f0f0f0);
        }

        .task-item.active {
          background: var(--accent-light, #e3f2fd);
          border-left: 3px solid var(--accent, #2563eb);
        }

        .task-item-header {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .task-item-title {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          flex: 1;
          line-height: 1.4;
          word-break: break-word;
        }

        .status-badge {
          flex-shrink: 0;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          position: relative;
        }

        .status-dot {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        .task-item-meta {
          margin: 0;
          font-size: 12px;
          color: var(--text-secondary, #999);
        }

        .task-detail {
          padding: 1.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .detail-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border-color, #e0e0e0);
        }

        .detail-title {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          flex: 1;
        }

        .detail-status {
          padding: 6px 12px;
          border-radius: 4px;
          color: white;
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }

        .detail-body {
          flex: 1;
          overflow-y: auto;
        }

        .detail-section {
          margin-bottom: 1.5rem;
        }

        .section-title {
          margin: 0 0 0.5rem 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-secondary, #666);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .section-content {
          margin: 0;
          font-size: 14px;
          line-height: 1.6;
          color: var(--text-primary, #333);
          white-space: pre-wrap;
          word-break: break-word;
        }

        .metadata-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
        }

        .metadata-item {
          display: flex;
          flex-direction: column;
        }

        .metadata-label {
          font-size: 12px;
          color: var(--text-secondary, #999);
          margin-bottom: 4px;
        }

        .metadata-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #333);
        }

        .detail-actions {
          display: flex;
          gap: 0.75rem;
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border-color, #e0e0e0);
        }

        .detail-actions .btn {
          flex: 1;
        }

        .empty-state,
        .empty-detail {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
          color: var(--text-secondary, #999);
          text-align: center;
        }

        @media (max-width: 1024px) {
          .tasks-split-panel {
            grid-template-columns: 280px 1fr;
          }
        }

        @media (max-width: 768px) {
          .tasks-split-panel {
            grid-template-columns: 1fr;
            height: auto;
          }

          .tasks-panel-left {
            max-height: 300px;
          }

          .metadata-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
