import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import { ShefMonoGlyph } from '../components/Logo';

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

const RING_STROKE: Record<string, string> = {
  up: '#1F9D57', warn: '#C2820F', down: '#E23D32', flat: '#BFC0C7',
};
const BRIEF_NAMES: Record<string, string> = {
  sales: 'Продажи', marketing: 'Маркетинг', service: 'Сервис (операции)',
  resources: 'Ресурсы и поставщики', finance: 'Финансы', hr: 'Персонал (HR)',
  it: 'Информационные технологии', quality: 'Качество и CX',
  briefing: 'Бизнес-портрет', point_a: 'Точка А', docs: 'Документация',
};
const BRIEF_DESCS: Record<string, string> = {
  sales: '12 метрик продаж с расчётом Health-показателя',
  marketing: '10 метрик маркетинга: бюджет, ROMI, лиды, бренд',
  service: '9 метрик операций: утилизация, маржа, качество сдачи',
  resources: '7 метрик закупок и работы с внешними поставщиками',
  finance: '8 метрик финансов: ликвидность, EBITDA, ДЗ, OCF',
  hr: '9 метрик HR: текучесть, вовлечённость, обучение',
  it: '9 метрик ИТ: uptime, MTTR, инциденты, безопасность',
  quality: '8 метрик качества и клиентского опыта (NPS, CAPA, СМК)',
  briefing: 'Общая информация о компании, продуктах, финансах и команде',
  point_a: 'Боли, цели и ресурсы для аудита',
  docs: 'Организационные схемы, процессы и отчётность',
};
// 8 функциональных брифингов с метриками и расчётом Health. Остальные типы
// (briefing/point_a/docs) остаются для отображения ранее созданных брифов.
const BRIEF_TYPES = ['sales', 'marketing', 'service', 'resources', 'finance', 'hr', 'it', 'quality'];
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Обзор', briefs: 'Брифы', docs: 'Документы', analytics: 'Аналитика', tasks: 'Задачи',
};

function statusPill(status: string) {
  if (status === 'Заполнено') return <span className="pill pill-green"><span className="led" />Заполнено</span>;
  if (status === 'В работе') return <span className="pill pill-amber">В работе</span>;
  return <span className="pill pill-gray">Не заполнено</span>;
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [briefModal, setBriefModal] = useState(false);
  const [newBriefType, setNewBriefType] = useState('');

  useEffect(() => {
    api.get(`/api/clients/${clientId}`)
      .then(r => setClient(r.data))
      .catch(() => navigate('/clients'))
      .finally(() => setLoading(false));
  }, [clientId, navigate]);

  async function reload() {
    const r = await api.get(`/api/clients/${clientId}`);
    setClient(r.data);
  }

  async function createBrief(briefType: string) {
    if (!client || !briefType) return;
    try {
      await api.post('/api/briefs', { brief_type: briefType, client_id: client.id });
      setBriefModal(false);
      await reload();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка создания брифа');
    }
  }

  function openBriefModal() {
    setNewBriefType(available[0] || '');
    setBriefModal(true);
  }

  async function deleteBrief(briefId: number) {
    if (!window.confirm('Удалить бриф?')) return;
    try {
      await api.delete(`/api/briefs/${briefId}`);
      await reload();
    } catch {
      alert('Ошибка удаления');
    }
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;
  if (!client) return null;

  // Защита от undefined: API может вернуть объект без briefs_list при ошибке.
  const briefs = client.briefs_list ?? [];
  const ringColor = RING_STROKE[client.health_cls] || RING_STROKE.flat;
  const pillCls = client.health === 100 ? 'pill-green' : client.health > 0 ? 'pill-amber' : 'pill-gray';
  const pillLabel = client.health === 100 ? 'Активен' : client.health > 0 ? 'В работе' : 'Новый';

  const existing = new Set(briefs.map(b => b.brief_type));
  const available = BRIEF_TYPES.filter(t => !existing.has(t));
  const activity = briefs
    .filter(b => b.updated_at)
    .map(b => ({ time: b.updated_at as string, text: `Бриф «${BRIEF_NAMES[b.brief_type] || b.brief_type}» обновлён` }));

  return (
    <div className="page">
      <div className="detail-top">
        <Link to="/clients" className="back"><Icon name="arrowLeft" size={18} />Клиенты</Link>
        <div className="detail-top-actions">
          <Link to="/chat" className="btn btn-ghost btn-sm"><Icon name="chat" size={16} />Открыть чат</Link>
        </div>
      </div>

      <div className="detail-body">
        <div className="client-hero rise">
          <span className="big-av" style={{ background: client.color }}>{client.initials}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hero-name">
              {client.name}
              <span className={`pill ${pillCls}`}><span className="led" />{pillLabel}</span>
            </div>
            <div className="hero-sub">
              Анкеты: {client.done} / {client.total} · Health {client.health}% · Добавлен {client.created_at_fmt}
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={() => navigate('/orchestration')}>
              <Icon name="sparkle" size={17} />Анализ в Сети агентов
            </button>
          </div>
        </div>

        <div className="detail-tabs">
          <div className="tabs">
            {(['overview', 'briefs', 'docs', 'analytics', 'tasks'] as Tab[]).map(t => (
              <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {tab === 'overview' && (
          <div className="detail-grid" style={{ marginTop: 20 }}>
            {/* Состояние */}
            <div className="section-card rise d1">
              <div className="sc-head"><div className="sc-title">Состояние клиента</div></div>
              <div className="health-big">
                <div>
                  <div className="hb-score">
                    {client.health > 0 ? <>{client.health}<small> /100</small></> : <span style={{ color: 'var(--ink-4)' }}>—</span>}
                  </div>
                  <div className="hb-state" style={{ color: ringColor }}>{client.health_label}</div>
                  <div className="hb-delta">
                    {client.health > 0 ? `Заполнено ${client.done} из ${client.total} анкет` : 'Заполните брифы для оценки'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                  <svg width="92" height="92" viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="21" cy="21" r="18" fill="none" stroke="var(--border-2)" strokeWidth="3.5" />
                    <circle cx="21" cy="21" r="18" fill="none" stroke={ringColor} strokeWidth="3.5"
                      strokeDasharray={`${client.ring_filled} ${client.ring_empty}`} strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Метрики */}
            <div className="section-card rise d2">
              <div className="sc-head"><div className="sc-title">Ключевые метрики</div></div>
              <div className="metrics-row">
                <div className="metric">
                  <div className="k">Анкеты</div>
                  <div className="v">{client.done}/{client.total}</div>
                  <div className={`d ${client.done === client.total && client.total > 0 ? 'up' : client.done > 0 ? 'flat' : 'down'}`}>
                    {client.done === client.total && client.total > 0 ? 'Готово' : client.done > 0 ? 'В процессе' : 'Не начато'}
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

            {/* Главные проблемы (AI) */}
            <div className="section-card span2 rise d3">
              <div className="sc-head">
                <div className="sc-headline">
                  <div className="sc-title">Главные проблемы</div>
                  <span className="shef-byline"><span className="shef-mono xs"><ShefMonoGlyph /></span>Анализ ШЕФ · по брифу и данным</span>
                </div>
              </div>
              <div className="empty-tab" style={{ padding: '32px 20px' }}>
                <div className="ei"><Icon name="sparkle" size={22} /></div>
                <b>ИИ пока не анализировал клиента</b>
                <span>Заполните брифы и запустите Сеть агентов — она выделит ключевые проблемы и риски.</span>
                <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => navigate('/orchestration')}>
                  <Icon name="sparkle" size={16} />Запустить анализ
                </button>
              </div>
            </div>

            {/* Рекомендуемые шаги */}
            <div className="section-card rise d4">
              <div className="sc-head">
                <div className="sc-headline">
                  <div className="sc-title">Рекомендуемые шаги</div>
                  <span className="shef-byline"><span className="shef-mono xs"><ShefMonoGlyph /></span>Подготовлено ШЕФ</span>
                </div>
              </div>
              <div>
                {client.done < client.total && (
                  <div className="step">
                    <span className="chk"><Icon name="check" size={13} stroke={2.6} /></span>
                    <div><b>Завершить брифинг</b><p>Заполнить оставшиеся анкеты ({client.total - client.done})</p></div>
                  </div>
                )}
                <div className="step">
                  <span className="chk"><Icon name="check" size={13} stroke={2.6} /></span>
                  <div><b>Запустить Сеть агентов</b><p>Получить план по функциям компании</p></div>
                </div>
              </div>
              <div className="an-cta" onClick={() => navigate('/orchestration')}><span>Сформировать план действий</span><Icon name="arrowRight" size={18} /></div>
            </div>

            {/* Активность */}
            <div className="section-card rise d5">
              <div className="sc-head"><div className="sc-title">Последняя активность</div></div>
              {activity.length > 0 ? (
                <div>
                  {activity.map((a, i) => (
                    <div key={i} className="act">
                      <span className="ai-ic"><Icon name="doc" size={15} /></span>
                      <div><div className="at">{a.time}</div><div className="atext">{a.text}</div></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-tab" style={{ padding: '24px 12px' }}>
                  <span>Пока нет активности по клиенту</span>
                </div>
              )}
            </div>

            {/* Быстрые действия */}
            <div className="section-card span2 rise d6">
              <div className="sc-head"><div className="sc-title">Быстрые действия</div></div>
              <div className="qa-row">
                <Link to="/chat" className="qa"><span className="qa-ic"><Icon name="chat" size={19} /></span><span>Новый чат</span></Link>
                <button className="qa" onClick={() => setTab('briefs')}><span className="qa-ic"><Icon name="doc" size={19} /></span><span>Открыть брифы</span></button>
                <button className="qa" onClick={() => navigate('/orchestration')}><span className="qa-ic"><Icon name="sparkle" size={19} /></span><span>Сеть агентов</span></button>
                <button className="qa" onClick={() => setTab('analytics')}><span className="qa-ic"><Icon name="chart" size={19} /></span><span>Аналитика</span></button>
              </div>
            </div>
          </div>
        )}

        {tab === 'briefs' && (
          <div style={{ marginTop: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700 }}>Брифы</h3>
              {available.length > 0 && (
                <button className="btn btn-primary btn-sm" onClick={openBriefModal}>
                  <Icon name="plus" size={15} />Создать бриф
                </button>
              )}
            </div>

            {briefs.length === 0 ? (
              <div className="empty-tab">
                <div className="ei"><Icon name="doc" size={24} /></div>
                <b>Брифы не добавлены</b>
                <span>Создайте первый бриф, чтобы собирать информацию о компании.</span>
              </div>
            ) : (
              <div className="brief-grid">
                {briefs.map((brief, i) => (
                  <div key={brief.id} className={`brief-card rise d${Math.min(i + 1, 6)}`}>
                    <h4>{BRIEF_NAMES[brief.brief_type] || brief.brief_type}</h4>
                    <p>{BRIEF_DESCS[brief.brief_type] || ''}</p>
                    <div className="bf-foot">
                      {statusPill(brief.status)}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Link to={`/briefs/${brief.id}`} className="btn btn-soft btn-sm">Открыть</Link>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => deleteBrief(brief.id)}>Удалить</button>
                      </div>
                    </div>
                    {brief.updated_at && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-4)', fontWeight: 600 }}>Изменено: {brief.updated_at}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'docs' && (
          <div className="empty-tab" style={{ marginTop: 22 }}>
            <div className="ei"><Icon name="doc" size={24} /></div>
            <b>Документы клиента</b>
            <span>Загрузите финансовую отчётность, договоры и выгрузки CRM — ИИ проанализирует их автоматически.</span>
          </div>
        )}
        {tab === 'analytics' && (
          <div className="empty-tab" style={{ marginTop: 22 }}>
            <div className="ei"><Icon name="chart" size={24} /></div>
            <b>Аналитика по клиенту</b>
            <span>Сквозные показатели и динамика появятся здесь после заполнения брифов.</span>
          </div>
        )}
        {tab === 'tasks' && (
          <div className="empty-tab" style={{ marginTop: 22 }}>
            <div className="ei"><Icon name="check" size={24} /></div>
            <b>Задачи по клиенту</b>
            <span>Создавайте задачи вручную или дайте ИИ сформировать план действий.</span>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => navigate('/orchestration')}>
              <Icon name="sparkle" size={16} />Сформировать план с ИИ
            </button>
          </div>
        )}
      </div>

      {briefModal && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setBriefModal(false); }}>
          <div className="modal-card">
            <h3 className="modal-title">Создать бриф</h3>
            <p className="modal-text">Выберите тип брифа для этого клиента.</p>
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label" htmlFor="brief_type">Тип брифа</label>
              <select id="brief_type" className="form-input" value={newBriefType} onChange={e => setNewBriefType(e.target.value)}>
                {available.map(t => <option key={t} value={t}>{BRIEF_NAMES[t] || t}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setBriefModal(false)}>Отмена</button>
              <button type="button" className="btn btn-primary" onClick={() => createBrief(newBriefType)} disabled={!newBriefType}>Создать</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
