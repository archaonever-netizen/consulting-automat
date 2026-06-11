import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { createGoal, listGoals } from '../services/goals';
import type { GoalListItem, MetricInput } from '../services/goals';
import '../styles/goals.css';

interface MetricRow {
  name: string;
  unit: string;
  targetValue: string;
  aggregation: 'flow' | 'endpoint';
}

function slug(name: string, i: number): string {
  const base = name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_а-я]/gi, '');
  return base || `metric_${i + 1}`;
}

export default function GoalsPage() {
  const navigate = useNavigate();
  const [goals, setGoals] = useState<GoalListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [metrics, setMetrics] = useState<MetricRow[]>([{ name: '', unit: '', targetValue: '', aggregation: 'flow' }]);

  useEffect(() => {
    let alive = true;
    listGoals()
      .then(data => { if (alive) setGoals(data); })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  function openModal() {
    setTitle(''); setStartDate(''); setDeadline('');
    setMetrics([{ name: '', unit: '', targetValue: '', aggregation: 'flow' }]);
    setModal(true);
  }

  function setMetric(i: number, patch: Partial<MetricRow>) {
    setMetrics(ms => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const rows = metrics.filter(m => m.name.trim());
    if (!title.trim() || !startDate || !deadline || rows.length === 0) return;
    const targetMetrics: MetricInput[] = rows.map((m, i) => ({
      id: slug(m.name, i),
      name: m.name.trim(),
      unit: m.unit.trim() || 'ед.',
      targetValue: m.targetValue === '' ? null : Number(m.targetValue),
      source: 'user_input',
      aggregation: m.aggregation,
    }));
    setBusy(true);
    try {
      const res = await createGoal({ title: title.trim(), startDate, deadline, targetMetrics });
      navigate(`/goals/${res.goalId}`);
    } catch (err) {
      const e2 = err as { response?: { data?: { detail?: unknown } } };
      alert(typeof e2.response?.data?.detail === 'string' ? e2.response.data.detail : 'Ошибка создания цели');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="page"><div className="loading-bar" /></div>;

  return (
    <div className="page">
      <div className="page-head rise">
        <div>
          <h1>Цели</h1>
          <p>Одна измеримая цель → разбиение на месяцы, недели и дни. ИИ предлагает, человек согласует, всё на проверяемых данных.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={openModal}><Icon name="plus" size={17} />Новая цель</button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="empty-tab">
          <div className="ei"><Icon name="trendUp" size={24} /></div>
          <b>Пока нет целей</b>
          <span>Задайте первую измеримую цель — ИИ предложит декомпозицию по уровням.</span>
        </div>
      ) : (
        <div className="goals-grid rise d1">
          {goals.map(g => (
            <button key={g.goalId} className="goal-card" onClick={() => navigate(`/goals/${g.goalId}`)}>
              <div className="gc-top">
                <span className="gc-ic"><Icon name="trendUp" size={18} /></span>
                <span className="gc-status">{g.status}</span>
              </div>
              <div className="gc-title">{g.title}</div>
              <div className="gc-meta">
                {g.updatedAt ? `Обновлено ${new Date(g.updatedAt).toLocaleDateString('ru-RU')}` : '—'}
                <Icon name="arrowRight" size={15} />
              </div>
            </button>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div className="modal-card modal-wide">
            <h3 className="modal-title">Новая цель</h3>
            <form onSubmit={submit}>
              <div className="form-group">
                <label className="form-label">Формулировка цели</label>
                <input className="form-input" value={title} onChange={e => setTitle(e.target.value)}
                  required autoFocus placeholder="Создать подразделение в Новосибирске за 6 месяцев" />
              </div>
              <div className="form-row2">
                <div className="form-group">
                  <label className="form-label">Старт</label>
                  <input type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Дедлайн</label>
                  <input type="date" className="form-input" value={deadline} onChange={e => setDeadline(e.target.value)} required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Измеримые метрики цели</label>
                <div className="metric-rows">
                  {metrics.map((m, i) => (
                    <div className="metric-row" key={i}>
                      <input className="form-input" placeholder="Например, нанять сотрудников"
                        value={m.name} onChange={e => setMetric(i, { name: e.target.value })} />
                      <input className="form-input mr-unit" placeholder="ед." value={m.unit}
                        onChange={e => setMetric(i, { unit: e.target.value })} />
                      <input className="form-input mr-val" type="number" placeholder="10" value={m.targetValue}
                        onChange={e => setMetric(i, { targetValue: e.target.value })} />
                      <select className="form-input mr-agg" value={m.aggregation}
                        title="Как метрика агрегируется по периодам"
                        onChange={e => setMetric(i, { aggregation: e.target.value as 'flow' | 'endpoint' })}>
                        <option value="flow">накопительная (Σ)</option>
                        <option value="endpoint">к финишу (=цель в конце)</option>
                      </select>
                      {metrics.length > 1 && (
                        <button type="button" className="mr-del" title="Удалить"
                          onClick={() => setMetrics(ms => ms.filter((_, j) => j !== i))}>
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                  onClick={() => setMetrics(ms => [...ms, { name: '', unit: '', targetValue: '', aggregation: 'flow' }])}>
                  <Icon name="plus" size={15} />Добавить метрику
                </button>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Создание…' : 'Создать цель'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
