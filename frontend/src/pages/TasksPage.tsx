import { useState, useEffect } from 'react';
import api from '../services/api';
import Icon from '../components/Icon';

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

const STATUS_PILL: Record<string, string> = {
  pending: 'pill-gray',
  in_progress: 'pill-blue',
  completed: 'pill-green',
  failed: 'pill-red',
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
  const [selected, setSelected] = useState<Task | null>(null);

  useEffect(() => {
    api.get('/api/tasks')
      .then(r => { setTasks(r.data); if (r.data.length) setSelected(r.data[0]); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const pill = (s: string) => STATUS_PILL[s] || 'pill-gray';
  const label = (s: string) => STATUS_LABELS[s] || s;

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-head rise">
        <div>
          <h1>Задачи</h1>
          <p>Список задач с детальным просмотром и статусами.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary"><Icon name="plus" size={16} />Создать задачу</button>
        </div>
      </div>

      <div className="tasks-split">
        <div className="card tasks-left">
          {tasks.length === 0 ? (
            <div className="empty-tab" style={{ padding: '48px 16px' }}>
              <div className="ei"><Icon name="check" size={22} /></div>
              <b>Нет задач</b>
              <span>Создайте новую задачу, чтобы начать.</span>
            </div>
          ) : (
            <div className="tasks-list">
              {tasks.map(t => (
                <button
                  key={t.id}
                  className={`tasks-item${selected?.id === t.id ? ' active' : ''}`}
                  onClick={() => setSelected(t)}
                >
                  <div className="tasks-item-row">
                    <span className="tasks-item-title">{t.title}</span>
                    <span className={`pill ${pill(t.status)}`} style={{ flexShrink: 0 }}>{label(t.status)}</span>
                  </div>
                  <span className="tasks-item-meta">
                    {new Date(t.created_at).toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="card tasks-right">
          {selected ? (
            <div className="tasks-detail">
              <div className="tasks-detail-head">
                <h2>{selected.title}</h2>
                <span className={`pill ${pill(selected.status)}`}>{label(selected.status)}</span>
              </div>

              {selected.goal && (
                <div className="tasks-sec"><div className="eyebrow">Цель</div><p>{selected.goal}</p></div>
              )}
              {selected.action_description && (
                <div className="tasks-sec"><div className="eyebrow">Описание действия</div><p>{selected.action_description}</p></div>
              )}
              {selected.expected_result && (
                <div className="tasks-sec"><div className="eyebrow">Ожидаемый результат</div><p>{selected.expected_result}</p></div>
              )}

              <div className="tasks-sec">
                <div className="eyebrow">Детали</div>
                <div className="tasks-meta-grid">
                  <div className="metric"><div className="k">ID</div><div className="v" style={{ fontSize: 15 }}>#{selected.id}</div></div>
                  <div className="metric"><div className="k">Создана</div><div className="v" style={{ fontSize: 15 }}>{new Date(selected.created_at).toLocaleDateString('ru-RU')}</div></div>
                  {selected.start_time && (
                    <div className="metric"><div className="k">Начало</div><div className="v" style={{ fontSize: 15 }}>{new Date(selected.start_time).toLocaleDateString('ru-RU')}</div></div>
                  )}
                  {selected.duration_minutes && (
                    <div className="metric"><div className="k">Длительность</div><div className="v" style={{ fontSize: 15 }}>{selected.duration_minutes} мин</div></div>
                  )}
                </div>
              </div>

              <div className="tasks-actions">
                <button className="btn btn-ghost btn-sm"><Icon name="edit" size={15} />Редактировать</button>
                <button className="btn btn-soft btn-sm"><Icon name="check" size={15} />Завершить</button>
              </div>
            </div>
          ) : (
            <div className="empty-tab" style={{ padding: '60px 16px' }}>
              <span>Выберите задачу из списка</span>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .tasks-split { display: grid; grid-template-columns: 340px 1fr; gap: 16px; margin-top: 6px; min-height: 520px; }
        .tasks-left, .tasks-right { padding: 0; overflow: hidden; }
        .tasks-list { display: flex; flex-direction: column; }
        .tasks-item { text-align: left; border: none; background: none; cursor: pointer; padding: 13px 16px; border-bottom: 1px solid var(--line); transition: var(--transition); display: flex; flex-direction: column; gap: 6px; }
        .tasks-item:hover { background: var(--surface-2); }
        .tasks-item.active { background: var(--accent-weak); box-shadow: inset 3px 0 0 var(--accent); }
        .tasks-item-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .tasks-item-title { font-size: 13.5px; font-weight: 600; color: var(--text-primary); line-height: 1.35; }
        .tasks-item-meta { font-size: 12px; color: var(--ink-4); font-weight: 600; }
        .tasks-detail { padding: 22px; }
        .tasks-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding-bottom: 16px; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
        .tasks-detail-head h2 { font-family: var(--font-display); font-size: 20px; font-weight: 700; letter-spacing: -.02em; }
        .tasks-sec { margin-bottom: 18px; }
        .tasks-sec p { font-size: 14px; line-height: 1.6; color: var(--text-primary); margin-top: 7px; white-space: pre-wrap; }
        .tasks-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
        .tasks-actions { display: flex; gap: 10px; padding-top: 16px; border-top: 1px solid var(--line); }
        @media (max-width: 900px) { .tasks-split { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
