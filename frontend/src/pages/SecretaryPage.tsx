import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';

type Channel = 'local' | 'telegram';

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  text: string;
  channel: Channel;
  at: Date;
  taskCards?: SecretaryTaskCard[];
}

interface SecretaryTaskCard {
  id: number;
  title: string;
  start_time?: string | null;
  duration_minutes?: number | null;
  preparation_notes?: string | null;
}

interface SecretaryResponse {
  text: string;
  tasks?: SecretaryTaskCard[];
  action: {
    type: string;
    title?: string | null;
    task_id?: number | null;
  };
  created_at: string;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatStartCountdown(startTime?: string | null): string {
  if (!startTime) return 'Время не задано';
  const start = new Date(startTime);
  if (Number.isNaN(start.getTime())) return 'Время не задано';

  const diffMs = start.getTime() - Date.now();
  const absMinutes = Math.round(Math.abs(diffMs) / 60000);
  if (diffMs < 0) {
    if (absMinutes < 60) return `началась ${absMinutes || 1} мин назад`;
    const hoursAgo = Math.round(absMinutes / 60);
    if (hoursAgo < 24) return `началась ${hoursAgo} ч назад`;
    return `началась ${Math.round(hoursAgo / 24)} д назад`;
  }

  if (absMinutes < 60) return `через ${absMinutes || 1} мин`;
  const hours = Math.round(absMinutes / 60);
  if (hours < 24) return `через ${hours} ч`;
  if (hours < 72) return `через ${Math.round(hours / 24)} д`;
  return start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } }; message?: string };
  if (typeof e.response?.data?.detail === 'string') return e.response.data.detail;
  return e.message || 'Не удалось отправить сообщение';
}

export default function SecretaryPage() {
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel>('local');
  const [text, setText] = useState('');
  const [chatId, setChatId] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: 'system',
      channel: 'local',
      text: 'Локальное ядро готово. Попробуйте: "добавь задачу подготовить КП на 45 минут" или "задачи".',
      at: new Date(),
    },
  ]);

  const placeholder = useMemo(() => {
    if (channel === 'telegram') return 'Тестовое сообщение в Telegram';
    return 'Напишите команду секретарю';
  }, [channel]);

  function pushMessage(message: Omit<ChatMessage, 'id' | 'at'>) {
    setMessages(prev => [...prev, { ...message, id: Date.now() + prev.length, at: new Date() }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;

    setText('');
    setBusy(true);
    pushMessage({ role: 'user', text: value, channel });

    try {
      if (channel === 'telegram') {
        await api.post('/api/secretary/telegram/send', {
          text: value,
          chat_id: chatId.trim() ? Number(chatId) : null,
        });
        pushMessage({
          role: 'assistant',
          channel,
          text: 'Отправил сообщение в Telegram. Если бот молчит, проверьте TELEGRAM_BOT_TOKEN и chat_id.',
        });
      } else {
        const response = await api.post<SecretaryResponse>('/api/secretary/local/message', {
          text: value,
        });
        pushMessage({
          role: 'assistant',
          channel,
          text: response.data.text,
          taskCards: response.data.tasks || [],
        });
      }
    } catch (err) {
      pushMessage({ role: 'system', channel, text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page secretary-page">
      <div className="page-head rise">
        <div>
          <h1>Telegram-секретарь</h1>
          <p>Локальная консоль для проверки ядра, входящего webhook и исходящей отправки в Telegram.</p>
        </div>
        <div className="head-actions">
          <span className="pill pill-blue"><span className="led" />local core</span>
        </div>
      </div>

      <div className="secretary-grid">
        <section className="card secretary-chat">
          <div className="secretary-chat-head">
            <div>
              <div className="eyebrow">Диалог</div>
              <h2>Проверка сообщений</h2>
            </div>
            <div className="secretary-switch" role="tablist" aria-label="Канал отправки">
              <button
                type="button"
                className={channel === 'local' ? 'active' : ''}
                onClick={() => setChannel('local')}
              >
                Локально
              </button>
              <button
                type="button"
                className={channel === 'telegram' ? 'active' : ''}
                onClick={() => setChannel('telegram')}
              >
                Telegram
              </button>
            </div>
          </div>

          <div className="secretary-messages">
            {messages.map(message => (
              <div key={message.id} className={`secretary-msg ${message.role}`}>
                <div className="secretary-msg-bubble">
                  <div className="secretary-msg-meta">
                    <span>{message.role === 'user' ? 'Вы' : message.role === 'assistant' ? 'Секретарь' : 'Система'}</span>
                    <span>{message.channel === 'telegram' ? 'Telegram' : 'Local'}</span>
                    <span>{formatTime(message.at)}</span>
                  </div>
                  <p>{message.text}</p>
                  {message.taskCards && message.taskCards.length > 0 && (
                    <div className="secretary-task-cards">
                      {message.taskCards.map(task => (
                        <button
                          key={task.id}
                          type="button"
                          className="secretary-task-card"
                          onClick={() => navigate(`/tasks?taskId=${task.id}`)}
                        >
                          <span className="secretary-task-card-title">{task.title}</span>
                          <span className="secretary-task-card-meta">
                            <Icon name="clock" size={13} />
                            {formatStartCountdown(task.start_time)}
                          </span>
                          {task.preparation_notes && (
                            <span className="secretary-task-card-note">
                              {task.preparation_notes}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form className="secretary-composer" onSubmit={submit}>
            {channel === 'telegram' && (
              <input
                className="form-input secretary-chat-id"
                value={chatId}
                inputMode="numeric"
                placeholder="chat_id, если не задан SECRETARY_OWNER_TELEGRAM_ID"
                onChange={e => setChatId(e.target.value)}
              />
            )}
            <div className="secretary-input-row">
              <input
                className="form-input"
                value={text}
                placeholder={placeholder}
                autoFocus
                onChange={e => setText(e.target.value)}
              />
              <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()}>
                <Icon name="send" size={16} />
                {busy ? 'Отправка...' : 'Отправить'}
              </button>
            </div>
          </form>
        </section>

        <aside className="secretary-side">
          <div className="card secretary-panel">
            <div className="eyebrow">Маршруты</div>
            <div className="secretary-route">
              <b>В приложение</b>
              <code>POST /api/secretary/local/message</code>
              <span>Используется этой страницей. Команды создают задачи от имени текущего пользователя.</span>
            </div>
            <div className="secretary-route">
              <b>В Telegram</b>
              <code>POST /api/secretary/telegram/send</code>
              <span>Отправляет текст в Telegram через токен бота.</span>
            </div>
            <div className="secretary-route">
              <b>Из Telegram</b>
              <code>POST /api/secretary/telegram/webhook</code>
              <span>Принимает update от Telegram, прогоняет через локальное ядро и отвечает в чат.</span>
            </div>
          </div>

          <div className="card secretary-panel">
            <div className="eyebrow">Команды</div>
            <button type="button" className="secretary-example" onClick={() => setText('добавь задачу подготовить КП на 45 минут')}>
              <Icon name="plus" size={15} />
              <span>добавь задачу подготовить КП на 45 минут</span>
            </button>
            <button type="button" className="secretary-example" onClick={() => setText('задачи')}>
              <Icon name="list" size={15} />
              <span>задачи</span>
            </button>
            <button type="button" className="secretary-example" onClick={() => setText('отправь сообщение Я на связи, отвечу чуть позже')}>
              <Icon name="send" size={15} />
              <span>отправь сообщение Я на связи, отвечу чуть позже</span>
            </button>
            <button type="button" className="secretary-example" onClick={() => setText('создать чат 123456 @client_user')}>
              <Icon name="chat" size={15} />
              <span>создать чат 123456 @client_user</span>
            </button>
            <button type="button" className="secretary-example" onClick={() => setText('помощь')}>
              <Icon name="help" size={15} />
              <span>помощь</span>
            </button>
          </div>
        </aside>
      </div>

      <style>{`
        .secretary-grid { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 16px; align-items: start; }
        .secretary-chat { padding: 0; overflow: hidden; min-height: 620px; display: flex; flex-direction: column; }
        .secretary-chat-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
        .secretary-chat-head h2 { font-size: 20px; margin: 8px 0 0; }
        .secretary-switch { display: inline-flex; gap: 3px; padding: 3px; background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--radius-md); }
        .secretary-switch button { border: none; background: transparent; padding: 8px 12px; border-radius: var(--radius-sm); color: var(--text-secondary); font-weight: 700; cursor: pointer; }
        .secretary-switch button.active { background: var(--card-bg); color: var(--accent-ink); box-shadow: var(--shadow-sm); }
        .secretary-messages { flex: 1; display: flex; flex-direction: column; gap: 12px; padding: 20px; overflow-y: auto; background: linear-gradient(180deg, rgba(244,246,249,.65), rgba(255,255,255,.35)); }
        .secretary-msg { display: flex; }
        .secretary-msg.user { justify-content: flex-end; }
        .secretary-msg.system { justify-content: center; }
        .secretary-msg-bubble { max-width: min(620px, 86%); padding: 12px 14px; border: 1px solid var(--line); border-radius: 14px; background: var(--card-bg); box-shadow: var(--shadow-sm); }
        .secretary-msg.user .secretary-msg-bubble { color: #fff; background: var(--accent); border-color: var(--accent); }
        .secretary-msg.system .secretary-msg-bubble { background: var(--surface-2); box-shadow: none; }
        .secretary-msg-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-3); }
        .secretary-msg.user .secretary-msg-meta { color: rgba(255,255,255,.72); }
        .secretary-msg p { white-space: pre-wrap; font-size: 14px; line-height: 1.55; margin: 0; color: inherit; }
        .secretary-task-cards { display: grid; gap: 8px; margin-top: 10px; }
        .secretary-task-card { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 5px 10px; width: 100%; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); color: var(--text-primary); text-align: left; cursor: pointer; transition: var(--transition); }
        .secretary-task-card:hover { border-color: var(--accent-weak-2); background: var(--accent-weak); transform: translateY(-1px); }
        .secretary-task-card-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 800; letter-spacing: 0; }
        .secretary-task-card-meta { display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; color: var(--accent-ink); font-size: 11.5px; font-weight: 800; white-space: nowrap; }
        .secretary-task-card-note { grid-column: 1 / -1; color: var(--text-secondary); font-size: 12.5px; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .secretary-composer { padding: 14px 16px 16px; border-top: 1px solid var(--line); background: var(--card-bg); }
        .secretary-input-row { display: flex; gap: 10px; }
        .secretary-chat-id { margin-bottom: 10px; font-size: 13px; }
        .secretary-side { display: flex; flex-direction: column; gap: 16px; }
        .secretary-panel { padding: 18px; }
        .secretary-route { display: flex; flex-direction: column; gap: 7px; padding: 14px 0; border-bottom: 1px solid var(--line); }
        .secretary-route:last-child { border-bottom: none; padding-bottom: 0; }
        .secretary-route b { font-size: 14px; }
        .secretary-route code { display: block; overflow-wrap: anywhere; padding: 8px 10px; border-radius: 8px; background: var(--surface-2); color: var(--accent-ink); font-size: 12px; }
        .secretary-route span { color: var(--text-secondary); font-size: 13px; line-height: 1.45; }
        .secretary-example { width: 100%; display: flex; align-items: center; gap: 9px; margin-top: 10px; padding: 10px 11px; border: 1px solid var(--line); border-radius: var(--radius-sm); background: var(--card-bg); color: var(--text-primary); text-align: left; cursor: pointer; transition: var(--transition); }
        .secretary-example:hover { background: var(--accent-weak); border-color: var(--accent-weak-2); color: var(--accent-ink); }
        .secretary-example span { min-width: 0; font-size: 13px; line-height: 1.35; }
        @media (max-width: 980px) { .secretary-grid { grid-template-columns: 1fr; } .secretary-chat { min-height: 560px; } }
        @media (max-width: 620px) { .secretary-chat-head, .secretary-input-row { flex-direction: column; align-items: stretch; } .secretary-msg-bubble { max-width: 100%; } }
      `}</style>
    </div>
  );
}
