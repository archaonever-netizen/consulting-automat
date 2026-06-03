// Client detail — Обзор + tabs
const DETAIL_TABS = ['Обзор', 'Брифы', 'Документы', 'Аналитика', 'Задачи'];

const BRIEF_DEFS = [
  { key: 'briefing', name: 'Бизнес-портрет', desc: 'Основная анкета для сбора формальной информации о бизнесе клиента.' },
  { key: 'point_a', name: 'Точка А', desc: 'Глубинное интервью: реальные боли, цели и ресурсы бизнеса.' },
  { key: 'docs', name: 'Документация', desc: 'Чек-лист сбора документов и ключевых артефактов бизнеса.' }
];

function statusPill(status) {
  if (status === 'Заполнено') return <span className="pill pill-green"><span className="led" />Заполнено</span>;
  if (status === 'В работе') return <span className="pill pill-amber">В работе</span>;
  return <span className="pill pill-gray">Не заполнено</span>;
}

function ClientDetail({ client, onBack, onOpenBrief, onNewChat, onToast }) {
  const [tab, setTab] = React.useState('Обзор');
  const c = client;
  const sparkColor = c.health >= 70 ? '#16A34A' : c.health >= 45 ? '#C2740B' : '#DC2626';
  const healthState = c.health >= 70 ? 'Хорошее состояние' : c.health >= 45 ? 'Требует внимания' : c.health > 0 ? 'Зона риска' : 'Нет данных';

  return (
    <div>
      <div className="detail-top">
        <button className="back" onClick={onBack}><Icon name="arrowLeft" size={18} />Назад</button>
        <div className="detail-top-actions">
          <button className="btn btn-ghost btn-sm" onClick={onNewChat}><Icon name="chat" size={16} />Открыть чат с клиентом</button>
          <button className="btn btn-ghost btn-icon btn-sm"><Icon name="dots" size={18} /></button>
        </div>
      </div>

      <div className="detail-body">
        <div className="client-hero rise">
          <span className="big-av" style={{ background: c.color }}>{c.initials}</span>
          <div>
            <div className="hero-name">{c.name}
              {c.status === 'Новый'
                ? <span className="pill pill-blue"><span className="led" style={{ background: 'var(--accent)' }} />Новый</span>
                : <span className="pill pill-green"><span className="led" />Активен</span>}
            </div>
            <div className="hero-sub">{c.industry} · {c.city} · Куратор: {c.owner}</div>
            <a className="hero-add"><Icon name="plus" size={14} />Добавить тег</a>
          </div>
          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onNewChat}><Icon name="chat" size={17} />Новый чат по клиенту</button>
          </div>
        </div>

        <div className="detail-tabs">
          <div className="tabs">
            {DETAIL_TABS.map(t => (
              <button key={t} className={'tab' + (tab === t ? ' active' : '')} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>
        </div>

        {tab === 'Обзор' && (
          <div className="detail-grid">
            {/* Health */}
            <div className="section-card rise d1">
              <div className="sc-head"><div className="sc-title">Состояние клиента</div></div>
              <div className="health-big">
                <div>
                  <div className="hb-score">{c.health > 0 ? c.health : '—'}<small> /100</small></div>
                  <div className="hb-state" style={{ color: sparkColor }}>{healthState}</div>
                  <div className="hb-delta">{c.health > 0 ? (c.trend[0] === '−' ? c.trend : '+' + c.trend.replace('+', '')) + ' за месяц' : 'заполните брифы для оценки'}</div>
                </div>
                <div style={{ marginLeft: 'auto' }}><Sparkline data={c.spark} w={150} h={70} color={sparkColor} /></div>
              </div>
            </div>

            {/* Metrics */}
            <div className="section-card rise d2">
              <div className="sc-head"><div className="sc-title">Ключевые метрики</div></div>
              <div className="metrics-row">
                {c.metrics.map((m, i) => (
                  <div key={i} className="metric">
                    <div className="k">{m.label}</div>
                    <div className="v">{m.value}</div>
                    {m.delta && <div className={'d ' + (m.dir === 'up' ? 'up' : m.dir === 'down' ? 'down' : 'flat')}>{m.delta}</div>}
                  </div>
                ))}
              </div>
            </div>

            {/* Problems */}
            <div className="section-card span2 rise d3">
              <div className="sc-head">
                <div className="sc-headline">
                  <div className="sc-title">Главные проблемы</div>
                  <span className="shef-byline"><span className="shef-mono xs" dangerouslySetInnerHTML={{ __html: window.SHEF_MONO }} />Анализ ШЕФ · по брифу и данным</span>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={onNewChat}>Смотреть полный анализ</button>
              </div>
              {c.problems.length > 0 ? (
                <div className="prob-grid">
                  {c.problems.map(p => (
                    <div key={p.n} className="prob">
                      <div className="pn">{p.n}</div>
                      <b>{p.title}</b>
                      <p>{p.desc}</p>
                      <div className={'ptag tone-' + p.tone}>{p.tag}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-tab" style={{ padding: '32px 20px' }}>
                  <div className="ei"><Icon name="sparkle" size={22} /></div>
                  <b>ИИ пока не анализировал клиента</b>
                  <span>Заполните брифы — и я выделю ключевые проблемы и риски</span>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => setTab('Брифы')}><Icon name="doc" size={16} />Перейти к брифам</button>
                </div>
              )}
            </div>

            {/* Next steps */}
            <div className="section-card rise d4">
              <div className="sc-head">
                <div className="sc-headline">
                  <div className="sc-title">Рекомендуемые шаги</div>
                  <span className="shef-byline"><span className="shef-mono xs" dangerouslySetInnerHTML={{ __html: window.SHEF_MONO }} />Подготовлено ШЕФ</span>
                </div>
              </div>
              <div>
                {c.steps.map((s, i) => (
                  <div key={i} className="step">
                    <span className="chk"><Icon name="check" size={13} stroke={2.6} /></span>
                    <div><b>{s.title}</b><p>{s.desc}</p></div>
                  </div>
                ))}
              </div>
              <div className="an-cta" onClick={onNewChat}><span>Сформировать план действий</span><Icon name="arrowRight" size={18} /></div>
            </div>

            {/* Activity */}
            <div className="section-card rise d5">
              <div className="sc-head"><div className="sc-title">Последняя активность</div></div>
              <div>
                {c.activity.map((a, i) => (
                  <div key={i} className="act">
                    <span className={'ai-ic' + (a.kind === 'ai' ? ' ai' : '')}>
                      <Icon name={a.kind === 'ai' ? 'sparkle' : a.kind === 'doc' ? 'doc' : 'edit'} size={15} />
                    </span>
                    <div><div className="at">{a.time}</div><div className="atext">{a.text}</div></div>
                  </div>
                ))}
              </div>
              <div className="an-cta"><span>Вся активность</span><Icon name="arrowRight" size={18} /></div>
            </div>

            {/* Quick actions */}
            <div className="section-card span2 rise d6">
              <div className="sc-head"><div className="sc-title">Быстрые действия</div></div>
              <div className="qa-row">
                {[
                  { ic: 'chat', t: 'Новый чат', a: onNewChat },
                  { ic: 'doc', t: 'Проанализировать документ', a: () => onToast('Открываю анализ документа…') },
                  { ic: 'check', t: 'Создать задачу', a: () => onToast('Создание задачи…') },
                  { ic: 'trendUp', t: 'Сформировать отчёт', a: () => onToast('Готовлю отчёт…') },
                  { ic: 'upload', t: 'Загрузить документ', a: () => onToast('Загрузка документа…') },
                  { ic: 'dots', t: 'Другое', a: () => onToast('Ещё действия') }
                ].map((q, i) => (
                  <button key={i} className="qa" onClick={q.a}>
                    <span className="qa-ic"><Icon name={q.ic} size={19} /></span>
                    <span>{q.t}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'Брифы' && (
          <div className="brief-grid" style={{ marginTop: 22 }}>
            {BRIEF_DEFS.map((b, i) => (
              <div key={b.key} className={'brief-card rise d' + (i + 1)}>
                <h4>{b.name}</h4>
                <p>{b.desc}</p>
                <div className="bf-foot">
                  {statusPill(c.briefs[b.key])}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => onToast('Экспорт PDF: ' + b.name)}>PDF</button>
                    <button className="btn btn-soft btn-sm" onClick={() => onOpenBrief(b.key)}>Открыть</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Документы' && (
          <div className="empty-tab"><div className="ei"><Icon name="doc" size={24} /></div><b>Документы клиента</b><span>Загрузите финансовую отчётность, договоры и выгрузки CRM — ИИ проанализирует их автоматически</span><button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={() => onToast('Загрузка документа…')}><Icon name="upload" size={16} />Загрузить документ</button></div>
        )}
        {tab === 'Аналитика' && (
          <div className="empty-tab"><div className="ei"><Icon name="chart" size={24} /></div><b>Аналитика по клиенту</b><span>Сквозные показатели, динамика выручки и воронка продаж появятся здесь после заполнения брифов</span></div>
        )}
        {tab === 'Задачи' && (
          <div className="empty-tab"><div className="ei"><Icon name="check" size={24} /></div><b>Задачи по клиенту</b><span>Создавайте задачи вручную или дайте ИИ сформировать план действий</span><button className="btn btn-primary btn-sm" style={{ marginTop: 16 }} onClick={onNewChat}><Icon name="sparkle" size={16} />Сформировать план с ИИ</button></div>
        )}
      </div>
    </div>
  );
}
window.ClientDetail = ClientDetail;
