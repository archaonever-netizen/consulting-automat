import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import api from '../services/api';

interface Message {
  id?: number;
  role: 'user' | 'assistant';
  content: string;
  tokens?: number;
  created_at?: string;
}

interface SubChat {
  id: number;
  task_id: number | null;
  version: number;
  tokens_used: number;
  created_at: string;
  messages: Message[];
}

interface ChatSession {
  id: number;
  title: string;
  subchats: SubChat[];
}

export default function ChatPage() {
  const [session, setSession] = useState<ChatSession | null>(null);
  const [activeSubchat, setActiveSubchat] = useState<SubChat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filledNote, setFilledNote] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadSession() {
    try {
      const { data } = await api.get<ChatSession>('/api/chat/session');
      setSession(data);
      if (data.subchats.length > 0) {
        await selectSubchat(data.subchats[data.subchats.length - 1].id);
      } else {
        await createNewSubchat(data);
      }
    } catch (e) {
      setError('Ошибка загрузки сессии');
    } finally {
      setLoading(false);
    }
  }

  async function selectSubchat(subchatId: number) {
    const { data } = await api.get<SubChat>(`/api/chat/subchats/${subchatId}`);
    setActiveSubchat(data);
    setMessages(data.messages);
  }

  async function createNewSubchat(sess?: ChatSession) {
    const s = sess || session;
    if (!s) return;
    const { data } = await api.post<SubChat>('/api/chat/session/subchats', { task_id: null });
    setActiveSubchat(data);
    setMessages([]);
    setSession(prev => prev ? { ...prev, subchats: [...prev.subchats, data] } : prev);
  }

  async function sendMessage() {
    if (!input.trim() || streaming || !activeSubchat) return;

    const userMsg: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    const sentContent = input;
    setInput('');
    setStreaming(true);
    setError(null);
    setFilledNote(null);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages(prev => [...prev, assistantMsg]);

    abortRef.current = new AbortController();

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/chat/subchats/${activeSubchat.id}/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ content: sentContent }),
          signal: abortRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      // SSE-события разделены '\n\n'. Буферизуем, т.к. сетевой чанк
      // может разорвать событие посередине.
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? ''; // последний фрагмент может быть неполным

        for (const evt of events) {
          for (const line of evt.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.chunk) {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: updated[updated.length - 1].content + parsed.chunk,
                  };
                  return updated;
                });
              }
              if (parsed.filled) {
                const labels = Object.keys(parsed.filled).join(', ');
                setFilledNote(`Заполнены поля задачи: ${labels}`);
              }
              if (parsed.error) {
                setError(parsed.error);
              }
            } catch {}
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

  function stopStream() {
    abortRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  if (loading) return <div className="page-loading">Загрузка чата...</div>;

  return (
    <div className="chat-page">
      <div className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h3 className="chat-sidebar-title">Подчаты</h3>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => createNewSubchat()}
          >
            + Новый
          </button>
        </div>
        <div className="chat-subchat-list">
          {session?.subchats.map(sc => (
            <button
              key={sc.id}
              className={`chat-subchat-item${activeSubchat?.id === sc.id ? ' active' : ''}`}
              onClick={() => selectSubchat(sc.id)}
            >
              <span className="chat-subchat-name">
                {sc.task_id ? `Задача #${sc.task_id}` : `Чат v${sc.version}`}
              </span>
              <span className="chat-subchat-tokens">{sc.tokens_used} т.</span>
            </button>
          ))}
        </div>
      </div>

      <div className="chat-main">
        <div className="chat-header">
          <h2 className="chat-title">
            {activeSubchat?.task_id
              ? `Чат по задаче #${activeSubchat.task_id}`
              : `Чат v${activeSubchat?.version ?? 1}`}
          </h2>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Начните диалог с ИИ-ассистентом</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message chat-message--${msg.role}`}>
              <div className="chat-message-bubble">
                <div className="chat-message-content">
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  ) : (
                    msg.content
                  )}
                  {streaming && i === messages.length - 1 && msg.role === 'assistant' && (
                    <span className="chat-cursor">▌</span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {filledNote && (
          <div className="chat-filled-note">
            ✓ {filledNote}
          </div>
        )}

        {error && (
          <div className="chat-error">
            {error}
          </div>
        )}

        <div className="chat-input-area">
          <textarea
            className="chat-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Напишите сообщение... (Enter для отправки, Shift+Enter для новой строки)"
            rows={3}
            disabled={streaming}
          />
          <div className="chat-input-actions">
            {streaming ? (
              <button className="btn btn-secondary" onClick={stopStream}>
                Стоп
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={sendMessage}
                disabled={!input.trim()}
              >
                Отправить
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
