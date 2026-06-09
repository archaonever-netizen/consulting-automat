import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';

type Tab = 'overview' | 'briefs' | 'docs' | 'analytics' | 'tasks';

interface BriefItem {
  id: number;
  brief_type: string;
  status: string;
  updated_at: string | null;
}

interface ClientDetail {
  id: number;
  name: string;
  initials: string;
  color: string;
  health: number;
  health_label: string;
  health_cls: string;
  done: number;
  total: number;
  ring_filled: number;
  ring_empty: number;
  created_at_fmt: string;
  briefs_list: BriefItem[];
}

const BRIEF_NAMES: Record<string, string> = {
  briefing: 'Бизнес-портрет',
  point_a: 'Точка А',
  docs: 'Документация',
};

const BRIEF_DESCS: Record<string, string> = {
  briefing: 'Общая информация о компании, продуктах, финансах и команде',
  point_a: 'Боли, цели и ресурсы для аудита',
  docs: 'Организационные схемы, процессы и отчётность',
};

type AnalysisPhase = 'idle' | 'loading' | 'done' | 'error';

interface AnalysisResult {
  participating_functions?: string[];
  agents_analysis?: Record<string, { status: string; analysis?: string; error?: string }>;
  consolidated_plan?: { status: string; plan?: string };
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');

  const [projectDesc, setProjectDesc] = useState('');
  const [analysisPhase, setAnalysisPhase] = useState<AnalysisPhase>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState('');
  const [progressText, setProgressText] = useState('');
  const [progressSec, setProgressSec] = useState(0);

  useEffect(() => {
    api.get(`/api/clients/${clientId}`)
      .then(r => setClient(r.data))
      .catch(() => navigate('/clients'))
      .finally(() => setLoading(false));
  }, [clientId, navigate]);

  async function createBrief(briefType: string) {
    if (!client) return;
    try {
      await api.post('/api/briefs', { brief_type: briefType, client_id: client.id });
      const r = await api.get(`/api/clients/${clientId}`);
      setClient(r.data);
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка создания брифа');
    }
  }

  async function deleteBrief(briefId: number) {
    if (!confirm('Удалить бриф?')) return;
    try {
      await api.delete(`/api/briefs/${briefId}`);
      setClient(prev => prev ? {
        ...prev,
        briefs_list: prev.briefs_list.filter(b => b.id !== briefId),
      } : prev);
    } catch {
      alert('Ошибка удаления');
    }
  }

  async function analyzeProject() {
    if (!projectDesc.trim()) { alert('Опишите проект'); return; }
    setAnalysisPhase('loading');
    setAnalysisResult(null);
    setAnalysisError('');
    setProgressText('Отправляем задачу...');
    setProgressSec(0);

    const timer = setInterval(() => setProgressSec(s => s + 1), 1000);

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/agent/project/${clientId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ project_description: projectDesc }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка запуска');

      const taskId = data.task_id;
      setProgressText('Анализируем задачу...');

      const poll = setInterval(async () => {
        try {
          const r2 = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/agent/task/${taskId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const d2 = await r2.json();
          if (d2.phase === 'running') {
            const done = (d2.completed_functions || []).length;
            const total = (d2.functions || []).length;
            setProgressText(`Советники работают... ${done} из ${total}`);
          } else if (d2.phase === 'consolidating') {
            setProgressText('Составляем план...');
          }
          if (d2.status === 'done') {
            clearInterval(poll);
            clearInterval(timer);
            setAnalysisResult(d2.result);
            setAnalysisPhase('done');
          } else if (d2.status === 'failed') {
            clearInterval(poll);
            clearInterval(timer);
            setAnalysisError(d2.error || 'Ошибка анализа');
            setAnalysisPhase('error');
          }
        } catch {}
      }, 2000);
    } catch (e: any) {
      clearInterval(timer);
      setAnalysisError(e.message || 'Ошибка');
      setAnalysisPhase('error');
    }
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;
  if (!client) return null;

  const healthColor = client.health_cls === 'up' ? '#16a34a' : client.health_cls === 'warn' ? '#c2740b' : client.health_cls === 'down' ? '#dc2626' : '#bfc0c7';
  const pillCls = client.health === 100 ? 'pill-green' : client.health > 0 ? 'pill-amber' : 'pill-gray';
  const pillLabel = client.health === 100 ? 'Активен' : client.health > 0 ? 'В работе' : 'Новый';

  const existingBriefTypes = new Set(client.briefs_list.map(b => b.brief_type));
  const availableBriefTypes = ['briefing', 'point_a', 'docs'].filter(t => !existingBriefTypes.has(t));

  return (
    <div className="page">
      <div className="detail-top">
        <Link to="/clients" className="back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/><path d="m12 5-7 7 7 7"/>
          </svg>
          Клиенты
        </Link>
        <div className="detail-top-actions">
          <Link to="/chat" className="btn btn-ghost btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.4 9.4 0 0 1-4-.9L3 20l1.4-4.5a8.38 8.38 0 0 1-.9-4A8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z"/>
            </svg>
            Открыть чат
          </Link>
        </div>
      </div>

      <div className="detail-body">

        <div className="client-hero rise">
          <span className="big-av" style={{ background: client.color }}>{client.initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hero-name">
              {client.name}
              <span className={`pill ${pillCls}`}><span className="led"></span>{pillLabel}</span>
            </div>
            <div className="hero-sub">
              Анкеты: {client.done} / {client.total} заполнено
              &nbsp;·&nbsp; Health {client.health}%
              &nbsp;·&nbsp; Добавлен {client.created_at_fmt}
            </div>
          </div>
          <div className="hero-actions">
            <Link to="/chat" className="btn btn-primary btn-sm">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.4 9.4 0 0 1-4-.9L3 20l1.4-4.5a8.38 8.38 0 0 1-.9-4A8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z"/>
              </svg>
              Чат по клиенту
            </Link>
          </div>
        </div>

        <div className="detail-tabs">
          <div className="tabs">
            {(['overview','briefs','docs','analytics','tasks'] as Tab[]).map(t => (
              <button
                key={t}
                className={`tab${tab === t ? ' active' : ''}`}
                onClick={() => setTab(t)}
              >
                {{ overview:'Обзор', briefs:'Брифы', docs:'Документы', analytics:'Аналитика', tasks:'Задачи' }[t]}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' && (
          <div className="detail-grid" style={{ marginTop: 20 }}>

            <div className="section-card rise d1">
              <div className="sc-head"><div className="sc-title">Состояние клиента</div></div>
              <div className="health-big">
                <div>
                  <div className="hb-score">
                    {client.health > 0
                      ? <>{client.health}<small> /100</small></>
                      : <span style={{ fontSize: 28, color: 'var(--ink-4)' }}>—</span>
                    }
                  </div>
                  <div className="hb-state" style={{ color: healthColor }}>{client.health_label}</div>
                  <div className="hb-delta">
                    {client.health > 0
                      ? `Заполнено ${client.done} из ${client.total} анкет`
                      : 'Заполните брифы для оценки'
                    }
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <svg className="health-ring" width="80" height="80" viewBox="0 0 50 50">
                    <circle className="track" cx="25" cy="25" r="18"/>
                    <circle
                      className={`fill ${client.health_cls}`}
                      cx="25" cy="25" r="18"
                      strokeDasharray={`${client.ring_filled} ${client.ring_empty}`}
                      strokeDashoffset="0"
                    />
                    <text x="25" y="26">{client.health}%</text>
                  </svg>
                </div>
              </div>
            </div>

            <div className="section-card rise d2">
              <div className="sc-head"><div className="sc-title">Ключевые метрики</div></div>
              <div className="metrics-row">
                <div className="metric">
                  <div className="k">Анкеты</div>
                  <div className="v">{client.done}/{client.total}</div>
                  <div className={`d ${client.done === client.total ? 'up' : client.done > 0 ? 'flat' : 'down'}`}>
                    {client.done === client.total ? 'Готово' : client.done > 0 ? 'В процессе' : 'Не начато'}
                  </div>
                </div>
                <div className="metric">
                  <div className="k">Статус</div>
                  <div className="v" style={{ fontSize: 15, marginTop: 10 }}>{client.health_label}</div>
                </div>
                <div className="metric">
                  <div className="k">Добавлен</div>
                  <div className="v" style={{ fontSize: 15, marginTop: 10 }}>{client.created_at_fmt}</div>
                </div>
              </div>
            </div>

            <div className="section-card span2 rise d3">
              <div className="sc-head">
                <div className="sc-headline">
                  <div className="sc-title">🤖 ИИ-анализ проекта</div>
                  <span className="shef-byline">Советники функций</span>
                </div>
              </div>

              {analysisPhase === 'idle' && (
                <div>
                  <textarea
                    value={projectDesc}
                    onChange={e => setProjectDesc(e.target.value)}
                    placeholder="Опишите задачу/проект для анализа..."
                    style={{ width: '100%', minHeight: 80, padding: 12, border: '1px solid var(--border)', borderRadius: 8, fontFamily: 'inherit', fontSize: 14, resize: 'vertical' }}
                  />
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={analyzeProject}>Анализировать</button>
                  </div>
                </div>
              )}

              {analysisPhase === 'loading' && (
                <div style={{ padding: '24px 0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-2)', fontWeight: 500 }}>
                    <div style={{ width: 20, height: 20, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', flexShrink: 0 }}></div>
                    <span>{progressText}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-4)', fontVariantNumeric: 'tabular-nums' }}>{progressSec} сек</span>
                  </div>
                </div>
              )}

              {analysisPhase === 'error' && (
                <div>
                  <div style={{ padding: 16, background: 'var(--danger-light)', borderRadius: 8, borderLeft: '4px solid var(--danger)', color: 'var(--danger)', marginBottom: 12 }}>
                    <strong>Ошибка:</strong> {analysisError}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setAnalysisPhase('idle')}>Попробовать снова</button>
                </div>
              )}

              {analysisPhase === 'done' && analysisResult && (
                <div>
                  {analysisResult.participating_functions && analysisResult.participating_functions.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: 12 }}>✓ Привлечённые функции:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {analysisResult.participating_functions.map(f => (
                          <span key={f} style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '6px 12px', borderRadius: 4, fontSize: 13 }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysisResult.consolidated_plan?.status === 'success' && (
                    <div style={{ padding: 16, background: 'var(--success-light)', borderLeft: '4px solid var(--success)', borderRadius: 4 }}>
                      <div style={{ fontWeight: 600, marginBottom: 12 }}>✨ Консолидированный план:</div>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, color: 'var(--ink-3)' }}>{analysisResult.consolidated_plan.plan}</div>
                    </div>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => { setAnalysisPhase('idle'); setProjectDesc(''); setAnalysisResult(null); }}>Очистить</button>
                </div>
              )}
            </div>

            <div className="section-card span2 rise d6">
              <div className="sc-head"><div className="sc-title">Быстрые действия</div></div>
              <div className="qa-row">
                <Link to="/chat" className="qa">
                  <span className="qa-ic">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 9.4 9.4 0 0 1-4-.9L3 20l1.4-4.5a8.38 8.38 0 0 1-.9-4A8.5 8.5 0 0 1 12 3a8.38 8.38 0 0 1 9 8.5Z"/>
                    </svg>
                  </span>
                  <span>Новый чат</span>
                </Link>
                <button className="qa" onClick={() => setTab('briefs')}>
                  <span className="qa-ic">
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                      <path d="M14 2v6h6"/>
                    </svg>
                  </span>
                  <span>Открыть брифы</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {tab === 'briefs' && (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>Брифы</h3>
              {availableBriefTypes.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {availableBriefTypes.map(t => (
                    <button key={t} className="btn btn-primary btn-sm" onClick={() => createBrief(t)}>
                      + {BRIEF_NAMES[t] || t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {client.briefs_list.length === 0 ? (
              <div className="empty-tab">
                <div className="ei">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>
                  </svg>
                </div>
                <b>Брифы не добавлены</b>
                <span>Создайте первый бриф, чтобы собирать информацию о компании</span>
              </div>
            ) : (
              <div className="brief-grid">
                {client.briefs_list.map((brief, i) => (
                  <div key={brief.id} className={`brief-card rise d${i + 1}`}>
                    <h4>{BRIEF_NAMES[brief.brief_type] || brief.brief_type}</h4>
                    <p>{BRIEF_DESCS[brief.brief_type] || ''}</p>
                    <div className="bf-foot">
                      <div className="bf-status">
                        <span className={`pill ${brief.status === 'Заполнено' ? 'pill-green' : brief.status === 'В работе' ? 'pill-amber' : 'pill-gray'}`}>
                          {brief.status === 'Заполнено' && <span className="led"></span>}
                          {brief.status}
                        </span>
                      </div>
                      <div className="bf-actions">
                        <Link to={`/briefs/${brief.id}`} className="btn btn-soft btn-sm">Открыть</Link>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteBrief(brief.id)}>Удалить</button>
                      </div>
                    </div>
                    {brief.updated_at && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-4)', fontWeight: 600 }}>
                        Изменено: {brief.updated_at}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <div className="empty-tab" style={{ marginTop: 22 }}>
            <div className="ei">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
                <path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>
              </svg>
            </div>
            <b>Документы клиента</b>
            <span>Загрузите финансовую отчётность, договоры и выгрузки CRM — ИИ проанализирует их автоматически</span>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} disabled>Загрузить документ</button>
          </div>
        )}

        {tab === 'analytics' && (
          <div className="empty-tab" style={{ marginTop: 22 }}>
            <div className="ei">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M3 20h18"/>
              </svg>
            </div>
            <b>Аналитика по клиенту</b>
            <span>Сквозные показатели, динамика выручки и воронка продаж появятся здесь после заполнения брифов</span>
          </div>
        )}

        {tab === 'tasks' && (
          <div className="empty-tab" style={{ marginTop: 22 }}>
            <div className="ei">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3.5" y="3.5" width="17" height="17" rx="4"/>
                <path d="m8.5 12 2.5 2.5 4.5-5"/>
              </svg>
            </div>
            <b>Задачи по клиенту</b>
            <span>Создавайте задачи вручную или дайте ИИ сформировать план действий</span>
            <Link to="/chat" className="btn btn-primary btn-sm" style={{ marginTop: 16 }}>Сформировать план с ИИ</Link>
          </div>
        )}

      </div>
    </div>
  );
}
