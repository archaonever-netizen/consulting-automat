import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import api from '../services/api';
import Icon from '../components/Icon';

interface Ref { id: number; key?: string; name: string; }
interface BotDetail {
  id: number;
  key: string;
  name: string;
  description: string | null;
  system_prompt: string | null;
  persistent_prompt: string | null;
  model: string | null;
  agent_impl: string;
  is_active: boolean;
  frameworks: Ref[];
  departments: Ref[];
}
interface FrameworkOpt { id: number; name: string; source_count: number; }
interface DepartmentOpt { id: number; name: string; }
interface Usage {
  period: string; date_from: string; date_to: string;
  prompt_tokens: number; completion_tokens: number; total_tokens: number;
}
interface Evidence { source_key: string | null; page_start: number | null; page_end: number | null; section: string | null; }
interface ChatTurn { role: 'user' | 'bot'; text: string; evidence?: Evidence[]; tokens?: number; error?: boolean; }

type Tab = 'overview' | 'prompts' | 'settings' | 'chat';

// Заголовок с unlock-токеном для редактирующих запросов (X-Edit-Unlock).
const editCfg = (token: string) => ({ headers: { 'X-Edit-Unlock': token } });

function errDetail(e: unknown): string {
  if (axios.isAxiosError(e)) {
    const data = e.response?.data as { detail?: string } | undefined;
    return data?.detail || e.message;
  }
  return 'Ошибка';
}
const isLockExpired = (e: unknown) => axios.isAxiosError(e) && e.response?.status === 423;

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');

  // Пароль-замок: токен живёт только в state (короткоживущий, не в localStorage).
  const [unlock, setUnlock] = useState<string>('');
  const locked = !unlock;

  const { data: bot, isLoading } = useQuery<BotDetail>({
    queryKey: ['bots', id],
    queryFn: async () => (await api.get(`/api/bots/${id}`)).data,
  });
  const { data: models } = useQuery<string[]>({
    queryKey: ['bot-models'],
    queryFn: async () => (await api.get('/api/bots/models')).data.models,
  });
  const { data: allFrameworks } = useQuery<FrameworkOpt[]>({
    queryKey: ['bot-frameworks'],
    queryFn: async () => (await api.get('/api/bots/frameworks')).data,
  });
  const { data: allDepartments } = useQuery<DepartmentOpt[]>({
    queryKey: ['bot-departments'],
    queryFn: async () => (await api.get('/api/bots/departments')).data,
  });
  const { data: lock } = useQuery<{ is_set: boolean }>({
    queryKey: ['bot-lock'],
    queryFn: async () => (await api.get('/api/bots/lock')).data,
  });
  const { data: usageToday } = useQuery<Usage>({
    queryKey: ['bot-usage', id, 'today'],
    queryFn: async () => (await api.get(`/api/bots/${id}/usage?period=today`)).data,
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ['bots', id] });
    qc.invalidateQueries({ queryKey: ['bots'] });
  }
  function onEditError(e: unknown) {
    if (isLockExpired(e)) {
      setUnlock('');
      alert('Сессия редактирования истекла. Разблокируйте снова.');
    } else {
      alert(errDetail(e));
    }
  }

  // Редактирующие операции (требуют unlock-токен). Возвращают успех.
  async function patchBot(fields: Record<string, unknown>): Promise<boolean> {
    try {
      await api.patch(`/api/bots/${id}`, fields, editCfg(unlock));
      refresh();
      return true;
    } catch (e) { onEditError(e); return false; }
  }
  async function putList(kind: 'frameworks' | 'departments', body: Record<string, unknown>): Promise<boolean> {
    try {
      await api.put(`/api/bots/${id}/${kind}`, body, editCfg(unlock));
      refresh();
      return true;
    } catch (e) { onEditError(e); return false; }
  }

  if (isLoading || !bot) return <div className="page"><div className="loading-bar" /></div>;

  return (
    <div className="page">
      <Link to="/employees" className="back-link">
        <Icon name="arrowLeft" size={18} />ИИ-Сотрудники
      </Link>

      <div className="page-head" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span className="kb-card-icon" style={{ width: 46, height: 46 }}>
          <Icon name="bolt" size={24} />
        </span>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 2 }}>{bot.name}</h1>
          <p className="page-subtitle" style={{ margin: 0 }}>{bot.description || 'Без описания'}</p>
        </div>
        <LockBadge locked={locked} isSet={lock?.is_set} onUnlock={setUnlock} />
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${tab === 'overview' ? ' active' : ''}`} onClick={() => setTab('overview')}>Обзор</button>
        <button className={`tab${tab === 'prompts' ? ' active' : ''}`} onClick={() => setTab('prompts')}>Промпты</button>
        <button className={`tab${tab === 'settings' ? ' active' : ''}`} onClick={() => setTab('settings')}>Настройки</button>
        <button className={`tab${tab === 'chat' ? ' active' : ''}`} onClick={() => setTab('chat')}>Чат</button>
      </div>

      {tab === 'overview' && (
        <OverviewTab key={`ov-${bot.id}`} bot={bot} id={id!} usageToday={usageToday} locked={locked} onSave={patchBot} />
      )}
      {tab === 'prompts' && (
        <PromptsTab key={`pr-${bot.id}`} bot={bot} locked={locked} onSave={patchBot} />
      )}
      {tab === 'settings' && (
        <SettingsTab
          key={`st-${bot.id}`} bot={bot} locked={locked} models={models || []}
          allFrameworks={allFrameworks || []} allDepartments={allDepartments || []}
          onSaveModel={patchBot} onSaveFrameworks={putList} onSaveDepartments={putList}
        />
      )}
      {tab === 'chat' && (
        <ChatTab botId={id!} onAnswered={() => qc.invalidateQueries({ queryKey: ['bot-usage', id, 'today'] })} />
      )}
    </div>
  );
}

// ─────────────────────────── Замок ──────────────────────────────────────────
function LockBadge({ locked, isSet, onUnlock }: { locked: boolean; isSet?: boolean; onUnlock: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  if (!locked) {
    return (
      <span className="badge" style={{ background: 'var(--accent-weak)', color: 'var(--accent-ink)' }}>
        <Icon name="check" size={13} /> Редактирование разблокировано
      </span>
    );
  }
  return (
    <>
      <button className="btn btn-soft btn-sm" onClick={() => setOpen(true)}>
        <Icon name="gear" size={15} /> Разблокировать
      </button>
      {open && <LockModal isSet={isSet} onClose={() => setOpen(false)} onUnlock={t => { onUnlock(t); setOpen(false); }} />}
    </>
  );
}

function LockModal({ isSet, onClose, onUnlock }: { isSet?: boolean; onClose: () => void; onUnlock: (t: string) => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (!isSet) {
        // Пароль ещё не задан — задаём, затем сразу получаем unlock-токен.
        await api.post('/api/bots/lock', { new_password: password });
        qc.invalidateQueries({ queryKey: ['bot-lock'] });
      }
      const r = await api.post('/api/bots/lock/verify', { password });
      onUnlock(r.data.unlock_token);
    } catch (e) {
      setErr(errDetail(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3 className="modal-title">{isSet ? 'Введите пароль-замок' : 'Задайте пароль-замок'}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
          {isSet
            ? 'Редактирование промптов и настроек защищено паролем.'
            : 'Пароль ещё не задан. Придумайте его — он потребуется для любого редактирования.'}
        </p>
        <form onSubmit={submit}>
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Пароль</label>
            <input type="password" className="form-input" value={password} autoFocus
              onChange={e => setPassword(e.target.value)} required minLength={4} />
          </div>
          {err && <div className="kb-form-err" style={{ marginBottom: 12 }}>{err}</div>}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {isSet ? 'Разблокировать' : 'Задать и разблокировать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────── Вкладка «Обзор» ─────────────────────────────────
function OverviewTab({ bot, id, usageToday, locked, onSave }: {
  bot: BotDetail; id: string; usageToday?: Usage; locked: boolean;
  onSave: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  const [name, setName] = useState(bot.name);
  const [description, setDescription] = useState(bot.description ?? '');
  const [periodOpen, setPeriodOpen] = useState(false);

  async function save() {
    if (await onSave({ name, description })) alert('Сохранено');
  }

  return (
    <>
      <div className="section-card">
        <div className="sc-head"><div className="sc-title">Счётчик токенов</div></div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <div style={{ fontSize: 34, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            {usageToday?.total_tokens ?? 0}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>токенов сегодня</div>
          <span style={{ flex: 1 }} />
          <button className="btn btn-soft btn-sm" onClick={() => setPeriodOpen(true)}>
            <Icon name="clock" size={15} /> За период
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="sc-head"><div className="sc-title">Название и описание</div></div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">Название</label>
          <input className="form-input" value={name} disabled={locked} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Описание</label>
          <textarea className="form-input" rows={3} value={description} disabled={locked}
            onChange={e => setDescription(e.target.value)} style={{ resize: 'vertical' }} />
        </div>
        <LockedHint locked={locked} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" disabled={locked} onClick={save}>Сохранить</button>
        </div>
      </div>

      {periodOpen && <UsageModal botId={id} onClose={() => setPeriodOpen(false)} />}
    </>
  );
}

function UsageModal({ botId, onClose }: { botId: string; onClose: () => void }) {
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const enabled = period !== 'custom' || (!!from && !!to);

  const { data, isFetching } = useQuery<Usage>({
    queryKey: ['bot-usage', botId, period, from, to],
    enabled,
    queryFn: async () => {
      let url = `/api/bots/${botId}/usage?period=${period}`;
      if (period === 'custom') url += `&date_from=${from}&date_to=${to}`;
      return (await api.get(url)).data;
    },
  });

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card">
        <h3 className="modal-title">Расход токенов за период</h3>
        <div className="tabs" style={{ marginBottom: 14 }}>
          {(['week', 'month', 'custom'] as const).map(p => (
            <button key={p} className={`tab${period === p ? ' active' : ''}`} onClick={() => setPeriod(p)}>
              {p === 'week' ? 'Неделя' : p === 'month' ? 'Месяц' : 'Период'}
            </button>
          ))}
        </div>
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <input type="date" className="form-input" value={from} onChange={e => setFrom(e.target.value)} />
            <input type="date" className="form-input" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        )}
        <div style={{ padding: '8px 0' }}>
          {isFetching ? <div className="loading-bar" /> : data ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-display)' }}>{data.total_tokens}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                всего · {data.prompt_tokens} промпт + {data.completion_tokens} ответ
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{data.date_from} — {data.date_to}</div>
            </div>
          ) : <div style={{ color: 'var(--text-secondary)' }}>Укажите даты периода.</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button className="btn btn-secondary" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Вкладка «Промпты» ───────────────────────────────
function PromptsTab({ bot, locked, onSave }: {
  bot: BotDetail; locked: boolean; onSave: (fields: Record<string, unknown>) => Promise<boolean>;
}) {
  const [systemPrompt, setSystemPrompt] = useState(bot.system_prompt ?? '');
  const [persistentPrompt, setPersistentPrompt] = useState(bot.persistent_prompt ?? '');

  async function save() {
    if (await onSave({ system_prompt: systemPrompt, persistent_prompt: persistentPrompt })) alert('Промпты сохранены');
  }

  return (
    <>
      <div className="section-card" style={locked ? { opacity: 0.6 } : undefined}>
        <div className="sc-head">
          <div>
            <div className="sc-title">Системный промпт</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Основная роль и поведение бота (идёт как system-роль). Это реальный промпт, которым бот пользуется.
            </p>
          </div>
        </div>
        <textarea className="form-input mono" rows={12} value={systemPrompt} disabled={locked}
          onChange={e => setSystemPrompt(e.target.value)} style={{ resize: 'vertical' }} />
      </div>

      <div className="section-card" style={locked ? { opacity: 0.6 } : undefined}>
        <div className="sc-head">
          <div>
            <div className="sc-title">Постоянный промпт</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Короткая стоячая инструкция — автоматически добавляется к КАЖДОМУ запросу бота.
            </p>
          </div>
        </div>
        <textarea className="form-input mono" rows={4} value={persistentPrompt} disabled={locked}
          onChange={e => setPersistentPrompt(e.target.value)} style={{ resize: 'vertical' }} />
      </div>

      <LockedHint locked={locked} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" disabled={locked} onClick={save}>Сохранить промпты</button>
      </div>
    </>
  );
}

// ─────────────────────────── Вкладка «Настройки» ─────────────────────────────
function SettingsTab({ bot, locked, models, allFrameworks, allDepartments, onSaveModel, onSaveFrameworks, onSaveDepartments }: {
  bot: BotDetail; locked: boolean; models: string[];
  allFrameworks: FrameworkOpt[]; allDepartments: DepartmentOpt[];
  onSaveModel: (fields: Record<string, unknown>) => Promise<boolean>;
  onSaveFrameworks: (kind: 'frameworks', body: Record<string, unknown>) => Promise<boolean>;
  onSaveDepartments: (kind: 'departments', body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [model, setModel] = useState(bot.model ?? '');
  const [fwIds, setFwIds] = useState<number[]>(bot.frameworks.map(f => f.id));
  const [deptIds, setDeptIds] = useState<number[]>(bot.departments.map(d => d.id));

  const toggle = (arr: number[], set: (v: number[]) => void, id: number) =>
    set(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  return (
    <>
      <div className="section-card">
        <div className="sc-head"><div className="sc-title">Модель</div></div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Переключение реально меняет модель — вызовы этого бота идут через выбранную.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <select className="form-input" value={model} disabled={locked} onChange={e => setModel(e.target.value)} style={{ flex: 1 }}>
            {model && !models.includes(model) && <option value={model}>{model} (текущая)</option>}
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn btn-primary" disabled={locked}
            onClick={async () => { if (await onSaveModel({ model })) alert('Модель сохранена'); }}>Сохранить</button>
        </div>
      </div>

      <div className="section-card">
        <div className="sc-head">
          <div>
            <div className="sc-title">Фреймворки</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Методологические пакеты знаний. Поиск бота опирается на источники выбранных фреймворков.
            </p>
          </div>
        </div>
        <CheckList items={allFrameworks.map(f => ({ id: f.id, label: `${f.name} · ${f.source_count} источн.` }))}
          selected={fwIds} locked={locked} onToggle={fid => toggle(fwIds, setFwIds, fid)} empty="Фреймворков пока нет." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" disabled={locked}
            onClick={async () => { if (await onSaveFrameworks('frameworks', { framework_ids: fwIds })) alert('Фреймворки сохранены'); }}>
            Сохранить фреймворки
          </button>
        </div>
      </div>

      <div className="section-card">
        <div className="sc-head">
          <div>
            <div className="sc-title">Отделы</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
              Связь с отделом делает бота «Сотрудником» отдела.
            </p>
          </div>
        </div>
        <CheckList items={allDepartments.map(d => ({ id: d.id, label: d.name }))}
          selected={deptIds} locked={locked} onToggle={did => toggle(deptIds, setDeptIds, did)} empty="Отделов пока нет." />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-primary" disabled={locked}
            onClick={async () => { if (await onSaveDepartments('departments', { department_ids: deptIds })) alert('Отделы сохранены'); }}>
            Сохранить отделы
          </button>
        </div>
      </div>

      <LockedHint locked={locked} />
    </>
  );
}

function CheckList({ items, selected, locked, onToggle, empty }: {
  items: { id: number; label: string }[]; selected: number[]; locked: boolean;
  onToggle: (id: number) => void; empty: string;
}) {
  if (items.length === 0) return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{empty}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(it => (
        <label key={it.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10,
          background: 'var(--surface-2)', cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.6 : 1,
        }}>
          <input type="checkbox" checked={selected.includes(it.id)} disabled={locked} onChange={() => onToggle(it.id)} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{it.label}</span>
        </label>
      ))}
    </div>
  );
}

// ─────────────────────────── Вкладка «Чат» ───────────────────────────────────
function ChatTab({ botId, onAnswered }: { botId: string; onAnswered: () => void }) {
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const message = input.trim();
    if (!message || busy) return;
    setTurns(t => [...t, { role: 'user', text: message }]);
    setInput('');
    setBusy(true);
    try {
      const r = await api.post(`/api/bots/${botId}/chat`, { message });
      setTurns(t => [...t, { role: 'bot', text: r.data.answer, evidence: r.data.evidence, tokens: r.data.usage?.total_tokens }]);
      onAnswered();
    } catch (e) {
      setTurns(t => [...t, { role: 'bot', text: errDetail(e), error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section-card">
      <div className="sc-head">
        <div>
          <div className="sc-title">Проверочный чат</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Использует текущий конфиг бота (модель, фреймворки, промпты). Токены идут в счётчик.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 14 }}>
        {turns.length === 0 && (
          <div style={{ color: 'var(--text-secondary)', fontSize: 14, padding: '12px 0' }}>
            Напишите рассуждение — бот вернёт разбор со ссылками на источники.
          </div>
        )}
        {turns.map((turn, i) => turn.role === 'user' ? (
          <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '85%', padding: '10px 14px', borderRadius: 14,
            background: 'var(--accent)', color: '#fff', fontSize: 14 }}>
            {turn.text}
          </div>
        ) : (
          <div key={i} style={{
            maxWidth: '95%', padding: '12px 16px', borderRadius: 14, fontSize: 14,
            background: turn.error ? 'var(--danger-weak, #fde8e8)' : 'var(--surface-2)',
            color: turn.error ? 'var(--danger, #c0392b)' : 'var(--text-primary)',
            border: '1px solid var(--border)',
          }}>
            <div className="md"><ReactMarkdown>{turn.text}</ReactMarkdown></div>
            {turn.evidence && turn.evidence.length > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  ИСТОЧНИКИ ПОИСКА
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {turn.evidence.map((ev, j) => (
                    <span key={j} className="badge" style={{ fontSize: 11 }}>
                      {(ev.source_key || '—').toUpperCase()}
                      {ev.page_start ? `, стр. ${ev.page_start}${ev.page_end && ev.page_end !== ev.page_start ? `–${ev.page_end}` : ''}` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {typeof turn.tokens === 'number' && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-secondary)' }}>{turn.tokens} токенов</div>
            )}
          </div>
        ))}
        {busy && <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Бот думает…</div>}
      </div>

      <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ display: 'flex', gap: 10 }}>
        <textarea className="form-input" rows={2} value={input} placeholder="Ваше рассуждение для разбора…"
          onChange={e => setInput(e.target.value)} style={{ resize: 'vertical', flex: 1 }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }} />
        <button type="submit" className="btn btn-primary" disabled={busy || !input.trim()}>
          <Icon name="send" size={16} /> Отправить
        </button>
      </form>
      <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 6 }}>Ctrl/⌘ + Enter — отправить</p>
    </div>
  );
}

// ─────────────────────────── Общее ──────────────────────────────────────────
function LockedHint({ locked }: { locked: boolean }) {
  if (!locked) return null;
  return (
    <p style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 0' }}>
      <Icon name="gear" size={14} /> Поля заблокированы. Нажмите «Разблокировать» вверху и введите пароль-замок, чтобы редактировать.
    </p>
  );
}
