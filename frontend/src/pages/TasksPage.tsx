import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';
import {
  buildTaskPayload,
  canComplete,
  emptyTaskForm,
  taskToForm,
} from './tasks/logic';
import type { TaskFormData } from './tasks/logic';

interface Task {
  id: number;
  title: string;
  client_id: number;
  status: string;
  start_time?: string;
  duration_minutes?: number;
  input_data?: string;
  goal?: string;
  action_description?: string;
  expected_result?: string;
  created_at: string;
}

interface ClientOption {
  id: number;
  name: string;
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

type Modal =
  | { mode: 'create' }
  | { mode: 'edit'; task: Task }
  | { mode: 'complete'; task: Task }
  | null;

function errText(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } };
  return typeof e.response?.data?.detail === 'string' ? e.response.data.detail : fallback;
}

export default function TasksPage() {
  const { data: tasks = [], isLoading: loading } = useQuery({
    queryKey: ['tasks'],
    queryFn: async () => (await api.get<Task[]>('/api/tasks')).data,
  });
  // Список клиентов для селекта формы (общий кэш с экраном «Клиенты»)
  const { data: clients = [] } = useQuery<ClientOption[]>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/api/clients')).data,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // По умолчанию выбрана первая задача (как раньше), выбор хранится по id,
  // чтобы переживать фоновое обновление списка из кэша.
  const selected = tasks.find(t => t.id === selectedId) ?? tasks[0] ?? null;

  const [modal, setModal] = useState<Modal>(null);
  const [form, setForm] = useState<TaskFormData>(emptyTaskForm());
  const [resultText, setResultText] = useState('');
  const [isFailure, setIsFailure] = useState(false);
  const [busy, setBusy] = useState(false);

  function openCreate() {
    setForm(emptyTaskForm());
    setModal({ mode: 'create' });
  }

  function openEdit(task: Task) {
    setForm(taskToForm(task));
    setModal({ mode: 'edit', task });
  }

  function openComplete(task: Task) {
    setResultText('');
    setIsFailure(false);
    setModal({ mode: 'complete', task });
  }

  function setF(patch: Partial<TaskFormData>) {
    setForm(f => ({ ...f, ...patch }));
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildTaskPayload(form);
    if (!payload) {
      alert('Заполните название и выберите клиента');
      return;
    }
    setBusy(true);
    try {
      if (modal?.mode === 'edit') {
        await api.put(`/api/tasks/${modal.task.id}`, payload);
      } else {
        const r = await api.post<Task>('/api/tasks', payload);
        setSelectedId(r.data.id);
      }
      // Кэш ['tasks'] сбрасывается автоматически (см. services/api.ts) —
      // список обновится без перезагрузки страницы.
      setModal(null);
    } catch (err) {
      alert(errText(err, 'Не удалось сохранить задачу'));
    } finally {
      setBusy(false);
    }
  }

  async function completeTask(e: React.FormEvent) {
    e.preventDefault();
    if (modal?.mode !== 'complete') return;
    setBusy(true);
    try {
      await api.post(`/api/tasks/${modal.task.id}/complete`, {
        actual_result: resultText.trim() || null,
        is_failure: isFailure,
      });
      setModal(null);
    } catch (err) {
      alert(errText(err, 'Не удалось завершить задачу'));
    } finally {
      setBusy(false);
    }
  }

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
          <button className="btn btn-primary" onClick={openCreate}>
            <Icon name="plus" size={16} />Создать задачу
          </button>
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
                  onClick={() => setSelectedId(t.id)}
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
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(selected)}>
                  <Icon name="edit" size={15} />Редактировать
                </button>
                {canComplete(selected.status) && (
                  <button className="btn btn-soft btn-sm" onClick={() => openComplete(selected)}>
                    <Icon name="check" size={15} />Завершить
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="empty-tab" style={{ padding: '60px 16px' }}>
              <span>Выберите задачу из списка</span>
            </div>
          )}
        </div>
      </div>

      {(modal?.mode === 'create' || modal?.mode === 'edit') && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}>
          <div className="modal-card modal-wide">
            <h3 className="modal-title">{modal.mode === 'edit' ? 'Редактировать задачу' : 'Новая задача'}</h3>
            <form onSubmit={saveTask}>
              <div className="form-group">
                <label className="form-label">Название</label>
                <input className="form-input" value={form.title} required autoFocus
                  placeholder="Позвонить клиенту по итогам брифа"
                  onChange={e => setF({ title: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Клиент</label>
                <select className="form-input" value={form.client_id} required
                  onChange={e => setF({ client_id: e.target.value })}>
                  <option value="" disabled>— выберите клиента —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-row2">
                <div className="form-group">
                  <label className="form-label">Начало (необязательно)</label>
                  <input type="datetime-local" className="form-input" value={form.start_time}
                    onChange={e => setF({ start_time: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Длительность, мин</label>
                  <input type="number" min="0" className="form-input" value={form.duration_minutes}
                    placeholder="60" onChange={e => setF({ duration_minutes: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Цель</label>
                <textarea className="form-input" rows={2} value={form.goal}
                  placeholder="Чего хотим добиться этой задачей"
                  onChange={e => setF({ goal: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Описание действия</label>
                <textarea className="form-input" rows={2} value={form.action_description}
                  placeholder="Что конкретно нужно сделать"
                  onChange={e => setF({ action_description: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Ожидаемый результат</label>
                <textarea className="form-input" rows={2} value={form.expected_result}
                  placeholder="Как поймём, что задача выполнена"
                  onChange={e => setF({ expected_result: e.target.value })} />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setModal(null)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Сохранение…' : modal.mode === 'edit' ? 'Сохранить' : 'Создать задачу'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal?.mode === 'complete' && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget && !busy) setModal(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">Завершить задачу</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 14 }}>{modal.task.title}</p>
            <form onSubmit={completeTask}>
              <div className="form-group">
                <label className="form-label">Фактический результат</label>
                <textarea className="form-input" rows={3} value={resultText} autoFocus
                  placeholder="Что получилось в итоге"
                  onChange={e => setResultText(e.target.value)} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' }}>
                <input type="checkbox" checked={isFailure} onChange={e => setIsFailure(e.target.checked)} />
                Задача не выполнена (зафиксировать как неудачу)
              </label>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.1rem' }}>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setModal(null)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Сохранение…' : isFailure ? 'Зафиксировать неудачу' : 'Завершить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
