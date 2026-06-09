import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import api from '../services/api';
import Icon from '../components/Icon';
import { ShefMonoGlyph } from '../components/Logo';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
}
interface SubChat {
  id: number;
  task_id: number | null;
  version: number;
  tokens_used: number;
  messages: Message[];
}
interface ChatSession {
  id: number;
  title: string;
  subchats: SubChat[];
}
interface TaskItem {
  id: number;
  title: string;
  status: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export default function ChatPage() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filledNote, setFilledNote] = useState<string | null>(null);
  const [taskModal, setTaskModal] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { init(); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function init() {
    try {
      const [s, t] = await Promise.all([
        api.get<ChatSession>('/api/chat/session'),
        api.get<TaskItem[]>('/api/tasks').catch(() => ({ data: [] as TaskItem[] })),
      ]);
      setSession(s.data);
      setTasks(t.data);
      const main = s.data.subchats.find(sc => sc.task_id === null) ?? s.data.subchats[0];
      if (main) await selectSubchat(main.id, s.data);
    } catch {
      setError('Ошибка загрузки чата');
    } finally {
      setLoading(false);
    }
  }

  async function reloadSession(): Promise<ChatSession | null> {
    const { data } = await api.get<ChatSession>('/api/chat/session');
    setSession(data);
    return data;
  }

  async function selectSubchat(id: number, sess?: ChatSession) {
    const src = sess ?? session;
    const local = src?.subchats.find(sc => sc.id === id);
    setActiveId(id);
    setError(null);
    setFilledNote(null);
    if (local) setMessages(local.messages ?? []);
    try {
      const { data } = await api.get<SubChat>(`/api/chat/subchats/${id}`);
      setMessages(data.messages ?? []);
    } catch { /* оставляем локальные */ }
  }

  const mainSub = session?.subchats.find(sc => sc.task_id === null) ?? null;
  const taskSubs = (session?.subchats ?? []).filter(sc => sc.task_id !== null);
  const taskTitle = (taskId: number | null) =>
    (taskId != null && tasks.find(t => t.id === taskId)?.title) || (taskId != null ? `Задача #${taskId}` : 'ИИ-Ассистент');
  const availableTasks = tasks.filter(t => !taskSubs.some(s => s.task_id === t.id));

  async function addTaskSubchat(taskId: number) {
    try {
      const { data } = await api.post<SubChat>('/api/chat/session/subchats', { task_id: taskId });
      setTaskModal(false);
      const sess = await reloadSession();
      await selectSubchat(data.id, sess ?? undefined);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Не удалось добавить подчат');
    }
  }

  async function deleteSubchat(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await api.delete(`/api/chat/subchats/${id}`);
      const sess = await reloadSession();
      if (activeId === id) {
        const main = sess?.subchats.find(sc => sc.task_id === null);
        if (main) await selectSubchat(main.id, sess ?? undefined);
      }
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Не удалось удалить');
    }
  }

  async function sendMessage() {
    if (!input.trim() || streaming || activeId == null) return;
    const sent = input;
    setMessages(prev => [...prev, { role: 'user', content: sent }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    setError(null);
    setFilledNote(null);
    abortRef.current = new AbortController();

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/api/chat/subchats/${activeId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: sent }),
        signal: abortRef.current.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const evt of events) {
          for (const line of evt.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const p = JSON.parse(line.slice(6));
              if (p.chunk) {
                setMessages(prev => {
                  const u = [...prev];
                  u[u.length - 1] = { ...u[u.length - 1], content: u[u.length - 1].content + p.chunk };
                  return u;
                });
              }
              if (p.filled) setFilledNote('Заполнены поля задачи: ' + Object.keys(p.filled).join(', '));
              if (p.error) setError(p.error);
            } catch { /* частичное событие */ }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError('Ошибка соединения с ИИ');
        setMessages(prev => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="chatx">
      {/* Левый сайдбар — чаты */}
      <aside className="chatx-col chatx-left">
        <div className="chatx-side-head"><span className="chatx-side-title">Чаты</span></div>
        <div className="chatx-list">
          {mainSub && (
            <button
              className={'chatx-chat-item' + (activeId === mainSub.id ? ' active' : '')}
              onClick={() => selectSubchat(mainSub.id)}
            >
              <span className="shef-mono ava"><ShefMonoGlyph /></span>
              <span>ИИ-Ассистент</span>
            </button>
          )}
        </div>
      </aside>

      {/* Центр — диалог */}
      <section className="chatx-col chatx-center">
        <div className="chatx-msgs">
          <div className="chatx-msgs-inner">
            {messages.length === 0 && (
              <div className="chatx-greet">
                <span className="shef-mono lg"><ShefMonoGlyph /></span>
                <b>{activeId === mainSub?.id ? 'ИИ-Ассистент ШЕФ' : taskTitle(taskSubs.find(s => s.id === activeId)?.task_id ?? null)}</b>
                <span>Задайте вопрос или опишите задачу — помогу разобраться.</span>
              </div>
            )}
            {messages.map((m, i) => {
              const last = i === messages.length - 1;
              if (m.role === 'user') {
                return (
                  <div key={i} className="msg user">
                    <div className="msg-body"><div className="bubble">{m.content}</div></div>
                  </div>
                );
              }
              return (
                <div key={i} className="msg ai">
                  <span className={'ava shef' + (streaming && last ? ' thinking' : '')}><ShefMonoGlyph /></span>
                  <div className="msg-body">
                    <div className="msg-name">ШЕФ <span className="role">ИИ-ассистент</span></div>
                    <div className="msg-text">
                      {m.content
                        ? <ReactMarkdown>{m.content}</ReactMarkdown>
                        : <div className="typing"><span /><span /><span /></div>}
                    </div>
                  </div>
                </div>
              );
            })}
            {filledNote && (
              <div className="msg ai">
                <span className="ava shef"><ShefMonoGlyph /></span>
                <div className="msg-body"><div className="msg-text" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)' }}><Icon name="check" size={16} />{filledNote}</div></div>
              </div>
            )}
            {error && <div className="orch-error" style={{ marginTop: 8 }}>{error}</div>}
            <div ref={endRef} />
          </div>
        </div>

        <div className="chatx-composer">
          <div className="composer">
            <div className="composer-box">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Напишите сообщение…"
                disabled={streaming}
              />
              {streaming ? (
                <button className="ic-btn" title="Остановить" onClick={() => abortRef.current?.abort()}><Icon name="stop" size={18} /></button>
              ) : (
                <button className="send" title="Отправить" onClick={sendMessage} disabled={!input.trim()}><Icon name="send" size={18} /></button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Правый сайдбар — подчаты */}
      <aside className="chatx-col chatx-right">
        <div className="chatx-side-head">
          <span className="chatx-side-title">Подчаты</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setTaskModal(true)} title="Добавить задачу">
            <Icon name="plus" size={15} />Добавить задачу
          </button>
        </div>
        <div className="chatx-list">
          {taskSubs.length === 0 ? (
            <div className="chatx-empty-side">Подчатов нет. Добавьте задачу — по ней появится отдельный диалог.</div>
          ) : (
            taskSubs.map(sc => (
              <div
                key={sc.id}
                className={'chatx-sub-item' + (activeId === sc.id ? ' active' : '')}
                onClick={() => selectSubchat(sc.id)}
              >
                <Icon name="check" size={15} />
                <span className="chatx-sub-name">{taskTitle(sc.task_id)}</span>
                <button className="chatx-sub-del" title="Удалить подчат" onClick={e => deleteSubchat(sc.id, e)}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {taskModal && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setTaskModal(false); }}>
          <div className="modal-card">
            <h3 className="modal-title">Добавить задачу</h3>
            <p className="modal-text">Выберите задачу — по ней откроется отдельный подчат для уточнения деталей.</p>
            <div className="chatx-list" style={{ maxHeight: 320, marginBottom: 8 }}>
              {availableTasks.length === 0 ? (
                <div className="chatx-empty-side">Нет доступных задач для добавления.</div>
              ) : (
                availableTasks.map(t => (
                  <button key={t.id} className="chatx-chat-item" onClick={() => addTaskSubchat(t.id)}>
                    <Icon name="check" size={16} />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                  </button>
                ))
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setTaskModal(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
