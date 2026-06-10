import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';

export interface MetricInput {
  label: string;
  hint?: string;
  type: 'number' | 'yesno' | 'date';
  unit?: string;
}
export interface Metric {
  id: string;
  question: string;
  inputs: MetricInput[];
  formula: string;
  calc_type: string;
  responsible: string;
  health_threshold: number | string;
  health_comparison: string;
  health_note: string;
}
export interface SalesQuestions {
  title: string;
  type: 'sales';
  metrics: Metric[];
  responsible_list: string[];
}

interface Props {
  briefId: string;
  questions: SalesQuestions;
  initialAnswers: Record<string, string>;
  initialStatus: string;
  clientId: number | null;
}

// ——— расчёт результата метрики (порт из Flask sales_brief.html) ———
function calcResult(m: Metric, vals: string[]): number | string | null {
  if (vals.some(v => !v && v !== '0')) return null;
  const nums = vals.map(v => parseFloat(v));
  switch (m.calc_type) {
    case 'division': return nums.length >= 2 ? +(nums[0] / nums[1]).toFixed(2) : null;
    case 'division_reverse': return nums.length >= 2 ? +(nums[1] / nums[0]).toFixed(2) : null;
    case 'division_percent': return nums.length >= 2 ? +((nums[0] / nums[1]) * 100).toFixed(1) : null;
    case 'division_percent_reverse': return nums.length >= 2 ? +((nums[1] / nums[0]) * 100).toFixed(1) : null;
    case 'subtraction': return nums.length >= 2 ? +(nums[0] - nums[1]).toFixed(0) : null;
    case 'growth_percent': return nums.length >= 2 && nums[1] !== 0 ? +(((nums[0] - nums[1]) / nums[1]) * 100).toFixed(1) : null;
    case 'date_diff': {
      if (vals[0] && vals[1]) {
        const d1 = new Date(vals[0]); const d2 = new Date(vals[1]);
        return Math.ceil(Math.abs(+d2 - +d1) / (1000 * 60 * 60 * 24));
      }
      return null;
    }
    case 'date_age': {
      if (vals[0]) {
        const d = new Date(vals[0]); const t = new Date();
        return Math.floor((+t - +d) / (1000 * 60 * 60 * 24 * 30.44));
      }
      return null;
    }
    case 'yesno': return vals[0];
    default: return null;
  }
}

function calcHealth(m: Metric, result: number | string): { healthy: boolean; percent: number } | null {
  const threshold = m.health_threshold;
  const num = typeof result === 'string' ? parseFloat(result) : result;
  let healthy = false;
  switch (m.health_comparison) {
    case 'gte': healthy = num >= (threshold as number); break;
    case 'lte': healthy = num <= (threshold as number); break;
    case 'gt': healthy = num > (threshold as number); break;
    case 'eq': healthy = result === threshold; break;
    case 'date_months': healthy = num <= (threshold as number); break;
  }
  let percent = 0;
  if (healthy) percent = 100;
  else if (m.health_comparison === 'gte') percent = Math.round((num / (threshold as number)) * 100);
  else if (m.health_comparison === 'lte') percent = Math.round((((threshold as number) + ((threshold as number) - num)) / (threshold as number)) * 100);
  else if (m.health_comparison === 'gt') percent = Math.round((num / ((threshold as number) + 1)) * 100);
  percent = Math.max(0, Math.min(100, percent));
  return { healthy, percent };
}

function fmtResult(m: Metric, result: number | string): string {
  const ct = m.calc_type;
  if (ct === 'division' || ct === 'division_reverse') return (+result).toFixed(2);
  if (ct === 'division_percent' || ct === 'division_percent_reverse' || ct === 'growth_percent') return result + '%';
  if (ct === 'yesno') return result === 'yes' ? 'Да' : 'Нет';
  return String(result);
}

export default function SalesBrief({ briefId, questions, initialAnswers, initialStatus, clientId }: Props) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function setVal(key: string, value: string) {
    setAnswers(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function save(complete?: boolean) {
    setSaving(true);
    try {
      await api.put(`/api/briefs/${briefId}`, { answers, status: complete ? 'Заполнено' : undefined });
      setSaved(true);
      if (complete) {
        setStatus('Заполнено');
        setTimeout(() => { if (clientId) navigate(`/clients/${clientId}`); }, 800);
      }
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  function goBack() {
    if (clientId) navigate(`/clients/${clientId}`); else navigate(-1);
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head rise">
        <div>
          <button className="back" onClick={goBack} style={{ marginBottom: 10 }}><Icon name="arrowLeft" size={18} />Назад к клиенту</button>
          <h1>{questions.title}</h1>
          <p>12 ключевых метрик продаж с расчётом Health-показателя в реальном времени.</p>
        </div>
        <span className={`pill ${status === 'Заполнено' ? 'pill-green' : status === 'В работе' ? 'pill-amber' : 'pill-gray'}`}>
          {status === 'Заполнено' && <span className="led" />}{status}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {questions.metrics.map((m, mi) => {
          const vals = m.inputs.map((_, i) => answers[`m_${m.id}_${i}`] ?? '');
          const result = calcResult(m, vals);
          const health = result !== null ? calcHealth(m, result) : null;
          const healthColor = health
            ? (health.healthy ? 'var(--success)' : health.percent >= 75 ? 'var(--amber)' : 'var(--danger)')
            : 'var(--ink-4)';

          return (
            <div key={m.id} className={`section-card rise d${Math.min(mi + 1, 8)}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span className="metric-num">{m.id}</span>
                <h4 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{m.question}</h4>
              </div>

              <div className="metric-inputs">
                {m.inputs.map((inp, i) => {
                  const key = `m_${m.id}_${i}`;
                  return (
                    <div key={i} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" htmlFor={key}>{inp.label}</label>
                      {inp.hint && <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 6 }}>{inp.hint}</div>}
                      {inp.type === 'yesno' ? (
                        <select id={key} className="form-input" value={answers[key] ?? ''} onChange={e => setVal(key, e.target.value)}>
                          <option value="">—</option>
                          <option value="yes">Да</option>
                          <option value="no">Нет</option>
                        </select>
                      ) : inp.type === 'date' ? (
                        <input id={key} type="date" className="form-input" value={answers[key] ?? ''} onChange={e => setVal(key, e.target.value)} />
                      ) : (
                        <input id={key} type="number" step="0.01" placeholder="0" className="form-input" value={answers[key] ?? ''} onChange={e => setVal(key, e.target.value)} />
                      )}
                      {inp.unit && <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>{inp.unit}</div>}
                    </div>
                  );
                })}
              </div>

              <div className="metric-formula">
                <span className="eyebrow">Формула</span>
                <code>{m.formula}</code>
              </div>

              <div className="form-group" style={{ marginTop: 14, maxWidth: 320 }}>
                <label className="form-label">Ответственный</label>
                <select className="form-input" value={answers[`r_${m.id}`] ?? m.responsible} onChange={e => setVal(`r_${m.id}`, e.target.value)}>
                  {questions.responsible_list.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="metric-health">
                <div className="eyebrow" style={{ color: 'var(--accent-ink)' }}>Показатель Health</div>
                <p style={{ fontSize: 12, color: 'var(--ink-2)', margin: '6px 0 10px' }}>{m.health_note}</p>
                <div className="mh-grid">
                  <div>
                    <div className="mh-k">Результат расчёта</div>
                    <div className="mh-v" style={{ color: 'var(--accent)' }}>{result !== null ? fmtResult(m, result) : '—'}</div>
                  </div>
                  <div>
                    <div className="mh-k">Health статус</div>
                    <div className="mh-v" style={{ color: healthColor }}>{health ? health.percent + '%' : '—'}</div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="brief-savebar" style={{
        position: 'sticky', bottom: 0, zIndex: 10, marginTop: 14,
        background: 'var(--glass-bg, rgba(255,255,255,0.78))', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid var(--line)', borderRadius: 18, padding: '14px 18px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => save(true)}>
            <Icon name="check" size={16} />Сохранить и завершить
          </button>
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => save(false)}>Сохранить черновик</button>
        </div>
        {saved && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--success)', fontWeight: 600 }}><Icon name="check" size={15} />Сохранено</span>}
      </div>
    </div>
  );
}
