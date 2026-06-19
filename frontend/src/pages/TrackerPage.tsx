import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AxiosError } from 'axios';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';

interface TrackerConnection {
  connected: boolean;
  default_queue?: string | null;
}

interface TrackerRef {
  id?: string | number;
  key?: string;
  name?: string;
  display?: string;
  [key: string]: unknown;
}

interface Queue extends TrackerRef {
  description?: string;
}

interface TrackerUser extends TrackerRef {
  email?: string;
}

interface Issue {
  id?: string | number;
  key?: string;
  summary?: string;
  description?: string;
  status?: TrackerRef;
  queue?: TrackerRef;
  assignee?: TrackerUser | null;
  createdAt?: string;
  updatedAt?: string;
  deadline?: string | null;
  dueDate?: string | null;
  [key: string]: unknown;
}

interface Transition extends TrackerRef {
  to?: TrackerRef;
}

const LS = {
  get<T>(key: string): T | null {
    try {
      const value = localStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage failures
    }
  },
};

function errorText(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

function refTitle(value?: TrackerRef | null): string {
  return value?.display || value?.name || value?.key || (value?.id != null ? String(value.id) : '');
}

function queueKey(queue: Queue): string {
  return queue.key || queue.name || String(queue.id || '');
}

function issueKey(issue: Issue): string {
  return issue.key || String(issue.id || '');
}

function issueTitle(issue: Issue): string {
  return issue.summary || issueKey(issue) || 'Без названия';
}

function statusTitle(issue: Issue): string {
  return refTitle(issue.status) || 'Без статуса';
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function issueDate(issue: Issue): string {
  return formatDate(issue.deadline || issue.dueDate || issue.updatedAt || issue.createdAt);
}

function groupIssues(issues: Issue[]): Array<[string, Issue[]]> {
  const groups = new Map<string, Issue[]>();
  for (const issue of issues) {
    const status = statusTitle(issue);
    groups.set(status, [...(groups.get(status) || []), issue]);
  }
  return Array.from(groups.entries());
}

export default function TrackerPage() {
  const [connected, setConnected] = useState<boolean | null>(() => {
    const cached = LS.get<boolean>('trk:connected');
    return typeof cached === 'boolean' ? cached : null;
  });
  const [queues, setQueues] = useState<Queue[]>(() => LS.get<Queue[]>('trk:yandex:queues') || []);
  const [selectedQueue, setSelectedQueue] = useState<string>(() => LS.get<string>('trk:yandex:queue') || '');
  const [issues, setIssues] = useState<Issue[]>(() => LS.get<Issue[]>('trk:yandex:issues') || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newSummary, setNewSummary] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);

  const selectedIssue = useMemo(
    () => issues.find(issue => issueKey(issue) === selectedIssueKey) || null,
    [issues, selectedIssueKey],
  );
  const grouped = useMemo(() => groupIssues(issues), [issues]);

  const loadIssues = useCallback(async () => {
    if (connected !== true) return;
    setLoading(true);
    setError(null);
    try {
      const trimmedSearch = search.trim();
      const params = trimmedSearch
        ? { query: trimmedSearch }
        : (selectedQueue ? { queue: selectedQueue } : {});
      const response = await api.get('/api/tracker/issues', { params });
      const data: Issue[] = response.data || [];
      setIssues(data);
      LS.set('trk:yandex:issues', data);
    } catch (err) {
      setError(errorText(err, 'Не удалось загрузить задачи из Яндекс Трекера'));
    } finally {
      setLoading(false);
    }
  }, [connected, search, selectedQueue]);

  useEffect(() => {
    async function init() {
      try {
        const connectionResponse = await api.get('/api/tracker/connection');
        const connection: TrackerConnection = connectionResponse.data;
        setConnected(connection.connected);
        LS.set('trk:connected', connection.connected);
        if (!connection.connected) return;

        const queuesResponse = await api.get('/api/tracker/queues');
        const nextQueues: Queue[] = queuesResponse.data || [];
        setQueues(nextQueues);
        LS.set('trk:yandex:queues', nextQueues);

        const cachedQueue = LS.get<string>('trk:yandex:queue') || '';
        const availableKeys = new Set(nextQueues.map(queueKey).filter(Boolean));
        const defaultQueue = connection.default_queue || '';
        const nextQueue = availableKeys.has(cachedQueue)
          ? cachedQueue
          : (defaultQueue && availableKeys.has(defaultQueue) ? defaultQueue : (nextQueues[0] ? queueKey(nextQueues[0]) : ''));
        setSelectedQueue(nextQueue);
      } catch (err) {
        setConnected(false);
        LS.set('trk:connected', false);
        setError(errorText(err, 'Не удалось проверить подключение Яндекс Трекера'));
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (connected === true) {
      LS.set('trk:yandex:queue', selectedQueue);
      const timer = window.setTimeout(() => {
        void loadIssues();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [connected, loadIssues, selectedQueue]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    await loadIssues();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const summary = newSummary.trim();
    if (!summary || !selectedQueue) return;
    setCreating(true);
    setError(null);
    try {
      const payload = {
        queue: selectedQueue,
        summary,
        description: newDescription.trim() || undefined,
      };
      const response = await api.post('/api/tracker/issues', payload);
      const issue: Issue = response.data;
      setIssues(current => [issue, ...current]);
      setSelectedIssueKey(issueKey(issue));
      setNewSummary('');
      setNewDescription('');
    } catch (err) {
      setError(errorText(err, 'Не удалось создать задачу в Яндекс Трекере'));
    } finally {
      setCreating(false);
    }
  }

  const patchIssueLocal = useCallback((key: string, patch: Partial<Issue>) => {
    setIssues(current => current.map(issue => issueKey(issue) === key ? { ...issue, ...patch } : issue));
  }, []);

  if (connected === false) {
    return (
      <div className="page">
        <div className="page-head rise"><div><h1>Трекер</h1><p>Задачи из Яндекс Трекера.</p></div></div>
        <div className="card">
          <div className="empty-tab" style={{ padding: '64px 16px' }}>
            <div className="ei"><Icon name="grid" size={22} /></div>
            <b>Яндекс Трекер не подключён</b>
            <span>Подключите Яндекс ID в профиле, чтобы работать с задачами.</span>
            <Link to="/profile" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}><Icon name="gear" size={15} />Перейти в профиль</Link>
          </div>
        </div>
      </div>
    );
  }
  if (connected === null) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-head rise">
        <div><h1>Трекер</h1><p>Задачи из Яндекс Трекера по очередям и статусам.</p></div>
        <div className="head-actions tracker-toolbar">
          <select value={selectedQueue} onChange={e => { setSelectedQueue(e.target.value); setSearch(''); }}>
            <option value="">Все недавние</option>
            {queues.map(queue => {
              const key = queueKey(queue);
              return <option key={key} value={key}>{key} {refTitle(queue) && `· ${refTitle(queue)}`}</option>;
            })}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={loading} onClick={loadIssues} title="Обновить">
            <Icon name="share" size={15} />Обновить
          </button>
        </div>
      </div>

      {error && <div className="tracker-error">{error}<button onClick={() => setError(null)}><Icon name="close" size={14} /></button></div>}

      <div className="tracker-layout">
        <section className="tracker-main">
          <form className="tracker-search" onSubmit={handleSearch}>
            <Icon name="search" size={16} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск запросом Яндекс Трекера, например: Assignee: me()"
            />
            <button className="btn btn-ghost btn-sm" type="submit" disabled={loading}>Найти</button>
          </form>

          {loading ? (
            <div className="loading-bar"></div>
          ) : issues.length === 0 ? (
            <div className="card">
              <div className="empty-tab" style={{ padding: '52px 16px' }}>
                <div className="ei"><Icon name="list" size={22} /></div>
                <b>Задач не найдено</b>
                <span>Выберите другую очередь или измените поисковый запрос.</span>
              </div>
            </div>
          ) : (
            <div className="tracker-board">
              {grouped.map(([status, statusIssues]) => (
                <div key={status} className="tracker-column">
                  <div className="tracker-column-head">
                    <span>{status}</span>
                    <b>{statusIssues.length}</b>
                  </div>
                  <div className="tracker-cards">
                    {statusIssues.map(issue => {
                      const key = issueKey(issue);
                      const active = selectedIssueKey === key;
                      return (
                        <button key={key} className={`tracker-card ${active ? 'active' : ''}`} onClick={() => setSelectedIssueKey(key)}>
                          <span className="tracker-card-key">{key}</span>
                          <span className="tracker-card-title">{issueTitle(issue)}</span>
                          <span className="tracker-card-meta">
                            {refTitle(issue.assignee) || 'Без исполнителя'}
                            {issueDate(issue) && <span>{issueDate(issue)}</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="tracker-side">
          <form className="tracker-create" onSubmit={handleCreate}>
            <div className="eyebrow">Новая задача</div>
            <label className="field">
              <span>Очередь</span>
              <input value={selectedQueue} onChange={e => setSelectedQueue(e.target.value.toUpperCase())} placeholder="KEY" required />
            </label>
            <label className="field">
              <span>Заголовок</span>
              <input value={newSummary} onChange={e => setNewSummary(e.target.value)} placeholder="Что нужно сделать" required />
            </label>
            <label className="field">
              <span>Описание</span>
              <textarea rows={5} value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Контекст задачи" />
            </label>
            <button className="btn btn-primary" type="submit" disabled={creating || !selectedQueue || !newSummary.trim()}>
              <Icon name="plus" size={15} />{creating ? 'Создание...' : 'Создать'}
            </button>
          </form>
        </aside>
      </div>

      {selectedIssue && (
        <IssueDrawer
          key={selectedIssueKey}
          issue={selectedIssue}
          onClose={() => setSelectedIssueKey(null)}
          onPatchLocal={patchIssueLocal}
          onReload={loadIssues}
          onError={setError}
        />
      )}

      <style>{`
        .tracker-toolbar { display: flex; align-items: center; gap: 10px; }
        .tracker-toolbar select { min-width: 220px; padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 13.5px; color: var(--text-primary); }
        .tracker-toolbar select:focus { outline: none; border-color: var(--accent); }
        .tracker-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 14px; padding: 10px 14px; border-radius: 9px; background: #fff1f0; color: #c0392b; font-size: 13px; border: 1px solid #ffd6d2; }
        .tracker-error button { border: none; background: none; color: inherit; cursor: pointer; display: flex; }
        .tracker-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 16px; align-items: start; }
        .tracker-main { min-width: 0; }
        .tracker-search { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
        .tracker-search input { flex: 1; min-width: 0; border: none; background: transparent; color: var(--text-primary); font-size: 14px; }
        .tracker-search input:focus { outline: none; }
        .tracker-board { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; align-items: start; }
        .tracker-column { border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); padding: 10px; min-height: 120px; }
        .tracker-column-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 2px 10px; font-size: 13px; font-weight: 800; color: var(--text-primary); }
        .tracker-column-head b { font-size: 12px; color: var(--ink-4); background: var(--surface); border-radius: 20px; padding: 1px 8px; }
        .tracker-cards { display: flex; flex-direction: column; gap: 8px; }
        .tracker-card { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; width: 100%; padding: 11px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); color: var(--text-primary); text-align: left; cursor: pointer; transition: var(--transition); }
        .tracker-card:hover, .tracker-card.active { border-color: var(--accent); box-shadow: 0 2px 9px rgba(15,23,42,.06); }
        .tracker-card-key { font-size: 11px; font-weight: 800; color: var(--accent); letter-spacing: .03em; }
        .tracker-card-title { font-size: 13.5px; font-weight: 650; line-height: 1.35; }
        .tracker-card-meta { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--ink-4); }
        .tracker-side { position: sticky; top: 16px; }
        .tracker-create { display: flex; flex-direction: column; gap: 13px; padding: 16px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field > span { font-size: 12px; font-weight: 600; color: var(--ink-4); }
        .field input, .field textarea { padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 14px; color: var(--text-primary); font-family: inherit; resize: vertical; }
        .field input:focus, .field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
        @media (max-width: 980px) {
          .tracker-layout { grid-template-columns: 1fr; }
          .tracker-side { position: static; }
          .tracker-toolbar { width: 100%; justify-content: stretch; }
          .tracker-toolbar select { flex: 1; min-width: 0; }
        }
      `}</style>
    </div>
  );
}

function IssueDrawer({ issue, onClose, onPatchLocal, onReload, onError }: {
  issue: Issue;
  onClose: () => void;
  onPatchLocal: (key: string, patch: Partial<Issue>) => void;
  onReload: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(issueTitle(issue));
  const [description, setDescription] = useState(issue.description || '');
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [busy, setBusy] = useState(false);
  const key = issueKey(issue);

  useEffect(() => {
    async function loadDetails() {
      try {
        const [issueResponse, transitionsResponse] = await Promise.all([
          api.get(`/api/tracker/issues/${encodeURIComponent(key)}`),
          api.get(`/api/tracker/issues/${encodeURIComponent(key)}/transitions`),
        ]);
        const fullIssue: Issue = issueResponse.data;
        setTitle(issueTitle(fullIssue));
        setDescription(fullIssue.description || '');
        onPatchLocal(key, fullIssue);
        setTransitions(transitionsResponse.data || []);
      } catch (err) {
        onError(errorText(err, 'Не удалось загрузить детали задачи'));
      }
    }
    loadDetails();
  }, [key, onError, onPatchLocal]);

  const dirty = title !== issueTitle(issue) || description !== (issue.description || '');

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/api/tracker/issues/${encodeURIComponent(key)}`, {
        summary: title,
        description,
      });
      onPatchLocal(key, { summary: title, description });
    } catch (err) {
      onError(errorText(err, 'Не удалось сохранить задачу'));
    } finally {
      setBusy(false);
    }
  }

  async function executeTransition(transition: Transition) {
    const transitionId = transition.id != null ? String(transition.id) : '';
    if (!transitionId) return;
    setBusy(true);
    try {
      await api.post(`/api/tracker/issues/${encodeURIComponent(key)}/transitions/${encodeURIComponent(transitionId)}`, {});
      await onReload();
    } catch (err) {
      onError(errorText(err, 'Не удалось изменить статус задачи'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <span className="eyebrow">Задача {key}</span>
            <h2>{statusTitle(issue)}</h2>
          </div>
          <button className="drawer-x" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <label className="field"><span>Заголовок</span><input value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="field"><span>Описание</span><textarea rows={8} value={description} onChange={e => setDescription(e.target.value)} placeholder="Описание задачи" /></label>

        <div className="issue-meta">
          <div><span>Очередь</span><b>{refTitle(issue.queue) || 'Не указана'}</b></div>
          <div><span>Исполнитель</span><b>{refTitle(issue.assignee) || 'Без исполнителя'}</b></div>
          <div><span>Обновлено</span><b>{formatDate(issue.updatedAt) || 'Нет даты'}</b></div>
        </div>

        {transitions.length > 0 && (
          <div className="transition-block">
            <span className="transition-title">Сменить статус</span>
            <div className="transition-list">
              {transitions.map(transition => (
                <button key={String(transition.id)} className="btn btn-ghost btn-sm" disabled={busy} onClick={() => executeTransition(transition)}>
                  <Icon name="arrowRight" size={14} />{refTitle(transition.to) || refTitle(transition) || 'Переход'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="drawer-actions">
          <button className="btn btn-primary btn-sm" disabled={!dirty || busy || !title.trim()} onClick={save}>
            <Icon name="check" size={15} />{busy ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </aside>

      <style>{`
        .drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.28); z-index: 50; display: flex; justify-content: flex-end; }
        .drawer { width: 440px; max-width: 92vw; height: 100%; background: var(--surface); border-left: 1px solid var(--line); padding: 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; box-shadow: -8px 0 30px rgba(0,0,0,.12); animation: drawerIn .18s ease; }
        @keyframes drawerIn { from { transform: translateX(20px); opacity: .4; } to { transform: none; opacity: 1; } }
        .drawer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .drawer-head h2 { margin: 4px 0 0; font-size: 18px; font-family: var(--font-display); }
        .drawer-x { border: none; background: none; color: var(--ink-4); cursor: pointer; display: flex; }
        .drawer-x:hover { color: var(--text-primary); }
        .issue-meta { display: grid; grid-template-columns: 1fr; gap: 8px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
        .issue-meta div { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
        .issue-meta span { color: var(--ink-4); }
        .issue-meta b { font-weight: 650; text-align: right; }
        .transition-block { display: flex; flex-direction: column; gap: 9px; }
        .transition-title { font-size: 12px; font-weight: 700; color: var(--ink-4); }
        .transition-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .drawer-actions { display: flex; gap: 10px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line); }
      `}</style>
    </div>
  );
}
