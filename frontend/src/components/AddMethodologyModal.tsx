import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from './Icon';

// Экран «Добавить методологию» (только для основателя). Загрузка PDF без терминала:
// форма → оценка стоимости + пароль-замок → фоновый конвейер с прогрессом →
// «Готово» с токенами и примерами карточек. «Зависшую» задачу (сервер
// перезапустился посреди импорта) распознаём по отсутствию прогресса и даём
// «Отменить/Повторить» вместо вечного спиннера.

interface Framework { id: number; key: string; name: string; source_count: number; }
interface Estimate { job_id: number; key: string; pages: number; est_tokens: number; est_cost_rub: number; }
interface JobStatus {
  job_id: number; key: string; status: string; stage: string | null; progress: string | null;
  error: string | null; tokens_total: number; actual_cost_rub: number; updated_at: string | null;
}
interface SampleCard { card_type: string; title: string; body: string; page_start: number | null; page_end: number | null; }

const STAGES: Array<[string, string]> = [
  ['extract', 'Извлечение текста и таблиц'],
  ['ingest', 'Запись в базу'],
  ['embed_fragments', 'Умный поиск (эмбеддинги)'],
  ['layers', 'Генерация карточек на русском'],
  ['embed_cards', 'Эмбеддинги карточек'],
  ['attach', 'Привязка к кластеру'],
];
const STUCK_MS = 180_000; // 3 минуты без прогресса → считаем зависшей

function errText(e: unknown): string {
  if (axios.isAxiosError(e)) return ((e.response?.data as { detail?: string } | undefined)?.detail) || e.message;
  return String(e);
}

export default function AddMethodologyModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<'form' | 'estimate' | 'progress' | 'done'>('form');
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [srcKey, setSrcKey] = useState('');
  const [language, setLanguage] = useState('en');
  const [methodology, setMethodology] = useState('');
  const [confidential, setConfidential] = useState(false);
  const [fwMode, setFwMode] = useState<'existing' | 'new'>('existing');
  const [fwKey, setFwKey] = useState('');
  const [fwName, setFwName] = useState('');
  const [password, setPassword] = useState('');
  const [unlock, setUnlock] = useState('');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [cards, setCards] = useState<SampleCard[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: frameworks } = useQuery<Framework[]>({
    queryKey: ['bot-frameworks'],
    queryFn: async () => (await api.get('/api/bots/frameworks')).data,
  });

  // ── 1. загрузка PDF + оценка ───────────────────────────────────────────────
  async function submitUpload(e: FormEvent) {
    e.preventDefault();
    if (!file) { setErr('Выберите PDF-файл'); return; }
    setErr(''); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('key', srcKey);
      fd.append('methodology', methodology);
      fd.append('language', language);
      fd.append('confidential', String(confidential));
      fd.append('framework_key', fwMode === 'existing' ? fwKey : '');
      fd.append('framework_name', fwMode === 'new' ? fwName : (frameworks?.find(f => f.key === fwKey)?.name ?? ''));
      const r = await api.post<Estimate>('/api/knowledge/sources/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setEstimate(r.data);
      setPhase('estimate');
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  // ── 2. подтверждение паролем-замком + запуск ───────────────────────────────
  async function confirmRun() {
    if (!estimate) return;
    setErr(''); setBusy(true);
    try {
      const v = await api.post('/api/bots/lock/verify', { password });
      const token = v.data.unlock_token as string;
      setUnlock(token);
      await api.post(`/api/knowledge/sources/jobs/${estimate.job_id}/run`, {}, { headers: { 'X-Edit-Unlock': token } });
      setPhase('progress');
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 409)
        setErr('Сначала задайте пароль-замок в разделе «ИИ-Сотрудники».');
      else if (axios.isAxiosError(e) && e.response?.status === 401) setErr('Неверный пароль-замок.');
      else setErr(errText(e));
    } finally { setBusy(false); }
  }

  // ── опрос статуса ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'progress' || !estimate) return;
    const poll = async () => {
      try {
        const s = (await api.get<JobStatus>(`/api/knowledge/sources/jobs/${estimate.job_id}`)).data;
        setJob(s);
        if (s.status === 'done') {
          const c = (await api.get<SampleCard[]>(`/api/knowledge/sources/${s.key}/sample-cards`)).data;
          setCards(c);
          setPhase('done');
        }
      } catch { /* временная ошибка сети — продолжаем опрос */ }
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [phase, estimate]);

  async function lockAction(fn: (token: string) => Promise<void>) {
    setErr(''); setBusy(true);
    try {
      let token = unlock;
      if (!token) { const v = await api.post('/api/bots/lock/verify', { password }); token = v.data.unlock_token; setUnlock(token); }
      await fn(token);
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 423) { setUnlock(''); setErr('Замок истёк — введите пароль ещё раз.'); }
      else setErr(errText(e));
    } finally { setBusy(false); }
  }

  const retry = () => lockAction(async (t) => {
    await api.post(`/api/knowledge/sources/jobs/${estimate!.job_id}/run`, {}, { headers: { 'X-Edit-Unlock': t } });
    setJob(j => j ? { ...j, status: 'running', error: null } : j);
  });
  const cancel = () => lockAction(async (t) => {
    await api.post(`/api/knowledge/sources/jobs/${estimate!.job_id}/cancel`, {}, { headers: { 'X-Edit-Unlock': t } });
    finish();
  });

  function finish() {
    qc.invalidateQueries({ queryKey: ['knowledge-sources'] });
    onClose();
  }

  const stuck = !!job && (job.status === 'running' || job.status === 'queued') && !!job.updated_at
    && (Date.now() - new Date(job.updated_at).getTime() > STUCK_MS);
  const failed = job?.status === 'failed';
  const curIdx = STAGES.findIndex(([s]) => s === job?.stage);

  return (
    <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget && phase !== 'progress') onClose(); }}>
      <div className="modal-card" style={{ maxWidth: 540 }}>
        <h3 className="modal-title">➕ Добавить методологию</h3>

        {phase === 'form' && (
          <form onSubmit={submitUpload}>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">PDF-файл методологии</label>
              <input type="file" accept="application/pdf" className="form-input"
                onChange={e => setFile(e.target.files?.[0] ?? null)} required />
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Название</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} required placeholder="CMMI for Development" />
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                <label className="form-label">Ключ (латиницей)</label>
                <input className="form-input" value={srcKey} onChange={e => setSrcKey(e.target.value)} required placeholder="cmmi" />
              </div>
              <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                <label className="form-label">Методология</label>
                <input className="form-input" value={methodology} onChange={e => setMethodology(e.target.value)} placeholder="CMMI" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                <label className="form-label">Язык</label>
                <select className="form-input" value={language} onChange={e => setLanguage(e.target.value)}>
                  <option value="en">Английский</option>
                  <option value="ru">Русский</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12, flex: 1 }}>
                <label className="form-label">Кластер</label>
                <select className="form-input" value={fwMode === 'new' ? '__new__' : fwKey}
                  onChange={e => { if (e.target.value === '__new__') setFwMode('new'); else { setFwMode('existing'); setFwKey(e.target.value); } }}>
                  <option value="">— выберите —</option>
                  {(frameworks ?? []).map(f => <option key={f.key} value={f.key}>{f.name}</option>)}
                  <option value="__new__">+ создать новый</option>
                </select>
              </div>
            </div>
            {fwMode === 'new' && (
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label className="form-label">Название нового кластера</label>
                <input className="form-input" value={fwName} onChange={e => setFwName(e.target.value)} required placeholder="Модели зрелости" />
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 14 }}>
              <input type="checkbox" checked={confidential} onChange={e => setConfidential(e.target.checked)} />
              🔒 Конфиденциально
            </label>
            {err && <div className="kb-form-err" style={{ marginBottom: 12 }}>{err}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Загрузка…' : 'Далее'}</button>
            </div>
          </form>
        )}

        {phase === 'estimate' && estimate && (
          <div>
            <p style={{ fontSize: 14, marginBottom: 8 }}>
              Документ: <b>{estimate.pages}</b> стр. Это платное действие — будет посчитан умный поиск и сгенерированы карточки на русском.
            </p>
            <div style={{ background: 'var(--surface-2, #f5f6f8)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 22, fontWeight: 800 }}>≈ {estimate.est_cost_rub} ₽</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>приблизительно, ≈{estimate.est_tokens.toLocaleString('ru')} токенов</div>
            </div>
            <div className="form-group" style={{ marginBottom: 12 }}>
              <label className="form-label">Пароль-замок (подтверждение)</label>
              <input type="password" className="form-input" value={password} autoFocus onChange={e => setPassword(e.target.value)} />
            </div>
            {err && <div className="kb-form-err" style={{ marginBottom: 12 }}>{err}</div>}
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setPhase('form')}>Назад</button>
              <button type="button" className="btn btn-primary" disabled={busy || !password} onClick={confirmRun}>{busy ? '…' : 'Добавить'}</button>
            </div>
          </div>
        )}

        {phase === 'progress' && (
          <div>
            {!stuck && !failed && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 14px' }}>
                {STAGES.map(([s, label], i) => {
                  const done = job?.status === 'done' || (curIdx >= 0 && i < curIdx);
                  const active = i === curIdx;
                  return (
                    <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', opacity: done || active ? 1 : 0.45 }}>
                      <Icon name={done ? 'check' : active ? 'clock' : 'doc'} size={16} />
                      <span style={{ fontWeight: active ? 700 : 400 }}>{label}</span>
                      {active && <span className="spinner" style={{ marginLeft: 'auto' }} />}
                    </li>
                  );
                })}
              </ul>
            )}
            {!stuck && !failed && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{job?.progress ?? 'Запуск…'}</p>
            )}
            {(stuck || failed) && (
              <div style={{ marginBottom: 14 }}>
                <div className="kb-form-err" style={{ marginBottom: 10 }}>
                  {failed ? `Импорт прервался: ${job?.error ?? 'ошибка'}` : 'Похоже, задача зависла — давно нет прогресса (возможно, сервер перезапускался). Данные в поиск не попали.'}
                </div>
                {!unlock && (
                  <div className="form-group" style={{ marginBottom: 10 }}>
                    <label className="form-label">Пароль-замок</label>
                    <input type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                )}
                {err && <div className="kb-form-err" style={{ marginBottom: 10 }}>{err}</div>}
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" disabled={busy} onClick={cancel}>Отменить</button>
                  <button type="button" className="btn btn-primary" disabled={busy} onClick={retry}>Повторить</button>
                </div>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && job && (
          <div>
            <div style={{ fontSize: 32, textAlign: 'center', margin: '6px 0' }}>✅</div>
            <p style={{ textAlign: 'center', fontWeight: 700, marginBottom: 6 }}>Готово! Источник добавлен и доступен ботам этого кластера.</p>
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 14 }}>
              Потрачено ≈ {job.actual_cost_rub} ₽ ({job.tokens_total.toLocaleString('ru')} токенов)
            </p>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Примеры карточек:</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14, maxHeight: 260, overflowY: 'auto' }}>
              {cards.slice(0, 3).map((c, i) => (
                <div key={i} style={{ background: 'var(--surface-2, #f5f6f8)', borderRadius: 10, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.card_type === 'method_card' ? '🟦 Карточка методики' : c.card_type === 'typical_error' ? '🟥 Типичная ошибка' : '🟨 Вопрос'} · стр. {c.page_start}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                  <div style={{ fontSize: 12.5 }}>{c.body.slice(0, 160)}…</div>
                </div>
              ))}
              {cards.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Карточки не сгенерированы (короткий или служебный документ).</div>}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={finish}>Закрыть</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
