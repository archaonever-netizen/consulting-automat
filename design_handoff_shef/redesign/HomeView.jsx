// Home — «Главная»: warm AI-native command home for a daily-driver PM
function HomeView({ clients, user, onNav, onOpenClient, onAsk }) {
  const [q, setQ] = React.useState('');

  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const firstName = user.name.split(' ')[0];

  const dateStr = (() => {
    try {
      const s = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
      return s.charAt(0).toUpperCase() + s.slice(1);
    } catch (e) { return ''; }
  })();

  const byName = name => clients.find(c => c.name === name) || clients[0];

  const focus = [
    { c: byName('ТехноСтрой'), ai: true, ins: <span>Зависимость от ключевых клиентов выросла до <b>65% выручки</b>. Подготовил план диверсификации.</span>, act: 'Разобрать' },
    { c: byName('Северная Пекарня'), ai: true, ins: <span>Бриф «Точка А» почти готов — остался <b>один раздел</b>. Закроем за 5 минут.</span>, act: 'Дозаполнить' },
    { c: byName('Гараж 78'), ai: true, ins: <span>Health упал до <b>48</b>: простой постов в будни. Есть гипотеза по загрузке.</span>, act: 'Открыть' }
  ].filter(f => f.c);

  const resume = [
    { c: byName('ТехноСтрой'), snip: 'Ключевые проблемы: зависимость от 3 клиентов, низкая конверсия КП…', time: '2 часа назад' },
    { c: byName('МедСервис Плюс'), snip: 'Сформировал план роста на Q3: сквозная аналитика и расписание врачей.', time: 'вчера' },
    { c: byName('Северная Пекарня'), snip: 'Рекомендации по учёту списаний и пересмотру закупок сырья.', time: '2 дня назад' }
  ].filter(r => r.c);

  const withHealth = clients.filter(c => c.health > 0);
  const avgHealth = Math.round(withHealth.reduce((a, c) => a + c.health, 0) / Math.max(1, withHealth.length));
  const briefsDone = clients.reduce((a, c) => a + Object.values(c.briefs).filter(s => s === 'Заполнено').length, 0);

  function ask(text) {
    const t = (text != null ? text : q).trim();
    if (!t) { onNav('chats'); return; }
    onAsk(t);
  }

  return (
    <div className="home-wrap">
      <div className="home" style={{ maxWidth: 880 }}>
        <div className="home-top">
          <div className="home-date">{dateStr}</div>
          <div className="home-top-actions">
            <button title="Уведомления"><Icon name="clock" size={18} /></button>
            <button title="Поделиться"><Icon name="share" size={18} /></button>
          </div>
        </div>

        {/* Hero */}
        <div className="hero">
          <span className="hero-ambient" />
          <svg className="hero-svg" viewBox="0 0 340 240" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="hgFade" x1="0" y1="0" x2="0.4" y2="1">
                <stop offset="0" stopColor="#2563EB" stopOpacity="0.5" />
                <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="hgSlash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#2563EB" stopOpacity="0.95" />
                <stop offset="1" stopColor="#2563EB" stopOpacity="0.1" />
              </linearGradient>
            </defs>
            <g stroke="url(#hgFade)" strokeWidth="1.2">
              <line x1="120" y1="0" x2="340" y2="220" />
              <line x1="150" y1="0" x2="340" y2="190" />
              <line x1="180" y1="0" x2="340" y2="160" />
              <line x1="210" y1="0" x2="340" y2="130" />
              <line x1="240" y1="0" x2="340" y2="100" />
              <line x1="270" y1="0" x2="340" y2="70" />
              <line x1="300" y1="0" x2="340" y2="40" />
            </g>
            <rect x="150" y="-4" width="4" height="118" rx="2" fill="url(#hgSlash)" transform="rotate(-45 152 55)" />
          </svg>
          <div className="hero-eyebrow rise">Сводка от ШЕФ</div>
          <h1 className="hero-greet rise d1">{greet}, {firstName}. <span className="soft">Вот что важно сегодня.</span></h1>
          <div className="hero-brief rise d2">
            <span className="shef-mono lg" dangerouslySetInnerHTML={{ __html: window.SHEF_MONO }} />
            <p>За ночь я просмотрел <b>5 клиентов</b>. Трое в хорошем состоянии, но у <b>ТехноСтрой</b> вырос риск зависимости от ключевых клиентов, а <b>Гараж 78</b> просел по загрузке. Предлагаю начать с них.</p>
          </div>

          {/* Ask bar */}
          <div className="ask rise d3">
            <div className="ask-box">
              <span className="shef-mono" dangerouslySetInnerHTML={{ __html: window.SHEF_MONO }} />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()}
                placeholder="Спросите ШЕФ или поставьте задачу…" />
              <span className="ask-kbd">⌘K</span>
              <button className="ask-send" onClick={() => ask()}><Icon name="send" size={18} /></button>
            </div>
            <div className="ask-chips">
              <button className="ask-chip" onClick={() => ask('Что важно сделать сегодня?')}><Icon name="sparkle" size={15} />Что важно сегодня?</button>
              <button className="ask-chip" onClick={() => ask('Покажи клиентов в зоне риска')}><Icon name="flag" size={15} />Клиенты в зоне риска</button>
              <button className="ask-chip" onClick={() => ask('Подведи итоги недели')}><Icon name="trendUp" size={15} />Итоги недели</button>
            </div>
          </div>
        </div>

        {/* Focus */}
        <div className="home-label rise d4">
          <span className="l">Сегодня в фокусе <span className="cnt">· {focus.length}</span></span>
          <a onClick={() => onNav('clients')}>Все клиенты <Icon name="arrowRight" size={14} /></a>
        </div>
        <div className="focus rise d4">
          {focus.map((f, i) => (
            <div key={i} className="focus-row" onClick={() => onOpenClient(f.c.id)}>
              <span className="focus-av" style={{ background: f.c.color }}>{f.c.initials}</span>
              <div className="focus-main">
                <div className="focus-cl">{f.c.name}{f.ai && <span className="ai-mark" title="Подготовлено ШЕФ"><Icon name="sparkle" size={11} /></span>}</div>
                <div className="focus-ins">{f.ins}</div>
              </div>
              <span className="focus-act" onClick={e => { e.stopPropagation(); onOpenClient(f.c.id); }}>{f.act}<Icon name="arrowRight" size={15} /></span>
            </div>
          ))}
        </div>

        {/* Resume */}
        <div className="home-label rise d5">
          <span className="l">Продолжить</span>
          <a onClick={() => onNav('chats')}>Все чаты <Icon name="arrowRight" size={14} /></a>
        </div>
        <div className="resume rise d5">
          {resume.map((r, i) => (
            <div key={i} className="resume-card" onClick={() => onNav('chats')}>
              <div className="rc-top"><span className="rc-av" style={{ background: r.c.color }}>{r.c.initials}</span><b>{r.c.name}</b></div>
              <div className="rc-snip">{r.snip}</div>
              <div className="rc-time"><Icon name="clock" size={13} />{r.time}</div>
            </div>
          ))}
        </div>

        {/* Pulse */}
        <div className="home-label rise d6"><span className="l">Портфель</span></div>
        <div className="pulse rise d6">
          <div className="pulse-stat"><div className="pv">{clients.length}</div><div className="pk">клиентов</div></div>
          <span className="pulse-div" />
          <div className="pulse-stat"><div className="pv">{avgHealth}</div><div className="pk">средний health</div></div>
          <span className="pulse-div" />
          <div className="pulse-stat"><div className="pv">{briefsDone}<span style={{ fontSize: 13, color: 'var(--ink-4)', fontWeight: 700 }}> / {clients.length * 3}</span></div><div className="pk">брифов заполнено</div></div>
          <div className="pulse-spark">
            <span className="pg">+6 за квартал</span>
            <Sparkline data={[58,60,59,62,61,64,63,66,65,66]} w={120} h={40} color="#3E8E5A" />
          </div>
        </div>
      </div>
    </div>
  );
}
window.HomeView = HomeView;
