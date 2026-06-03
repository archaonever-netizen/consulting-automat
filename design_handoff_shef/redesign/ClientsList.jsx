// Clients — list / overview page
function bdClass(status) {
  if (status === 'Заполнено') return 'done';
  if (status === 'В работе') return 'work';
  return 'none';
}

function ClientsList({ clients, onOpen, onAdd, onEdit, onDelete }) {
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const [view, setView] = React.useState('grid');

  const filtered = clients.filter(c => {
    const q = query.trim().toLowerCase();
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.industry.toLowerCase().includes(q) || c.city.toLowerCase().includes(q);
    const matchF = filter === 'all'
      || (filter === 'active' && c.status === 'Активен')
      || (filter === 'new' && c.status === 'Новый')
      || (filter === 'priority' && c.tags.includes('Приоритет'));
    return matchQ && matchF;
  });

  const total = clients.length;
  const active = clients.filter(c => c.status === 'Активен').length;
  const briefsDone = clients.reduce((a, c) => a + Object.values(c.briefs).filter(s => s === 'Заполнено').length, 0);
  const briefsTotal = clients.length * 3;
  const avgHealth = Math.round(clients.filter(c => c.health > 0).reduce((a, c) => a + c.health, 0) / Math.max(1, clients.filter(c => c.health > 0).length));

  function statusPill(c) {
    if (c.status === 'Новый') return <span className="pill pill-blue"><span className="led" style={{ background: 'var(--accent)' }} />Новый</span>;
    return <span className="pill pill-green"><span className="led" />Активен</span>;
  }

  function briefDots(c) {
    return (
      <span className="brief-dots" title="Брифинг · Точка А · Документы">
        {['briefing', 'point_a', 'docs'].map(k => <span key={k} className={'bd ' + bdClass(c.briefs[k])} />)}
      </span>
    );
  }

  return (
    <div className="page">
      <div className="page-head rise">
        <div>
          <h1>Клиенты</h1>
          <p>Картотека бизнесов под управлением. ИИ отслеживает состояние и подсказывает следующий шаг.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost"><Icon name="upload" size={17} />Импорт</button>
          <button className="btn btn-primary" onClick={onAdd}><Icon name="plus" size={17} />Добавить клиента</button>
        </div>
      </div>

      <div className="stats-strip rise d1">
        <div className="stat"><div className="k"><Icon name="users" size={15} />Всего клиентов</div><div className="v">{total}</div><div className="d up">+2 за месяц</div></div>
        <div className="stat"><div className="k"><Icon name="bolt" size={15} />Активные</div><div className="v">{active}</div><div className="d" style={{ color: 'var(--ink-3)' }}>{Math.round(active / total * 100)}% базы</div></div>
        <div className="stat"><div className="k"><Icon name="check" size={15} />Брифы заполнены</div><div className="v">{briefsDone}<small style={{ fontSize: 15, color: 'var(--ink-4)', fontWeight: 700 }}> / {briefsTotal}</small></div><div className="d up">{Math.round(briefsDone / briefsTotal * 100)}% готовности</div></div>
        <div className="stat"><div className="k"><Icon name="trendUp" size={15} />Средний health-score</div><div className="v">{avgHealth}</div><div className="d up">+6 за квартал</div></div>
      </div>

      <div className="toolbar rise d2">
        <div className="search">
          <Icon name="search" size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию, отрасли, городу…" />
        </div>
        <div className="seg">
          {[['all', 'Все'], ['active', 'Активные'], ['new', 'Новые'], ['priority', 'Приоритет']].map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="view-toggle">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} title="Сетка"><Icon name="grid" size={16} /></button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Список"><Icon name="list" size={16} /></button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-tab"><div className="ei"><Icon name="search" size={24} /></div><b>Ничего не найдено</b><span>Измените запрос или фильтр</span></div>
      )}

      {view === 'grid' && filtered.length > 0 && (
        <div className="clients-grid">
          {filtered.map((c, i) => (
            <div key={c.id} className={'client-card rise d' + Math.min(i + 1, 6)} onClick={() => onOpen(c.id)}>
              <div className="cc-top">
                <span className="big-av av-md" style={{ background: c.color }}>{c.initials}</span>
                <div className="cc-id">
                  <div className="cc-name"><span>{c.name}</span>{statusPill(c)}</div>
                  <div className="cc-meta">{c.industry} · {c.city}</div>
                </div>
                <div className="cc-actions" onClick={e => e.stopPropagation()}>
                  <button title="Чат по клиенту" onClick={() => onOpen(c.id)}><Icon name="chat" size={15} /></button>
                  <button title="Редактировать" onClick={() => onEdit(c)}><Icon name="edit" size={15} /></button>
                  <button className="del" title="Удалить" onClick={() => onDelete(c)}><Icon name="trash" size={15} /></button>
                </div>
              </div>

              <div className="cc-tags">
                {c.tags.map(t => <span key={t} className="tagchip">{t}</span>)}
              </div>

              <div className="cc-health">
                <HealthRing value={c.health} size={50} />
                <div className="health-info">
                  <b>{c.health > 0 ? (c.health >= 70 ? 'Хорошее' : c.health >= 45 ? 'Внимание' : 'Зона риска') : 'Нет данных'}</b>
                  <span>{c.health > 0 ? (c.trend[0] === '−' ? c.trend : '+' + c.trend.replace('+', '')) + ' за месяц' : 'нужен брифинг'}</span>
                </div>
                <span className="cc-spark"><Sparkline data={c.spark} color={c.health >= 70 ? '#16A34A' : c.health >= 45 ? '#C2740B' : c.health > 0 ? '#DC2626' : '#B6B9C0'} /></span>
              </div>

              <div className="cc-foot">
                <span>Куратор: {c.owner}</span>
                {briefDots(c)}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && filtered.length > 0 && (
        <div className="clients-table">
          <div className="ct-row head">
            <span>Клиент</span><span>Отрасль</span><span>Health</span><span>Брифы</span><span>Куратор</span>
          </div>
          {filtered.map(c => (
            <div key={c.id} className="ct-row" onClick={() => onOpen(c.id)}>
              <div className="ct-client">
                <span className="big-av av-sm" style={{ background: c.color }}>{c.initials}</span>
                <div><b>{c.name}</b><span>{c.city}</span></div>
              </div>
              <span style={{ fontSize: 13.5, color: 'var(--ink-2)', fontWeight: 600 }}>{c.industry}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><HealthRing value={c.health} size={38} /><Sparkline data={c.spark} w={64} h={28} color={c.health >= 70 ? '#16A34A' : c.health >= 45 ? '#C2740B' : '#DC2626'} fill={false} /></span>
              {briefDots(c)}
              <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>{c.owner}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
window.ClientsList = ClientsList;
