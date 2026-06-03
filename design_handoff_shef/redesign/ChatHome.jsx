// AI Chat — the product core
const CHAT_SUGGESTIONS = [
  { icon: 'doc', text: 'Проанализируй бриф клиента' },
  { icon: 'flag', text: 'Какие риски у ТехноСтрой?' },
  { icon: 'check', text: 'Сформируй план действий' },
  { icon: 'trendUp', text: 'Покажи финансовые инсайты' }
];

const AI_REPLIES = [
  'Готовлю ответ на основе данных клиента и заполненных брифов. Вот что я вижу: ключевые показатели стабильны, но есть зоны роста в маржинальности и конверсии. Хотите, я разложу это по шагам?',
  'Проанализировал доступные данные. Рекомендую начать с диверсификации клиентской базы и оптимизации воронки продаж — это даст самый быстрый эффект на горизонте квартала.',
  'Понял задачу. Я могу подготовить детальный план, собрать отчёт или открыть нужный раздел. С чего начнём?'
];

function ChatHome({ onNav, seed, onSeedConsumed }) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  })();

  const [messages, setMessages] = React.useState([
    { role: 'ai', time: '10:24', text: 'Привет, Алексей! Я здесь, чтобы помочь вам принимать лучшие решения и расти быстрее. Что хотите сделать?' },
    { role: 'user', time: '10:25', text: 'Проанализируй бриф клиента ТехноСтрой и выдели ключевые проблемы.' },
    {
      role: 'ai', time: '10:25',
      text: 'Провёл анализ брифа «Точка А» для ТехноСтрой. Вот ключевые проблемы, требующие первоочередного внимания:',
      list: [
        { b: 'Высокая зависимость от 3 ключевых клиентов', p: '65% выручки приходится на них. Высокий риск потери бизнеса.' },
        { b: 'Неэффективные процессы продаж', p: 'Конверсия на этапе КП всего 12%. Длительный цикл сделки — 45 дней.' },
        { b: 'Отсутствие системного маркетинга', p: 'Нет стабильного потока лидов. Зависимость от рекомендаций.' },
        { b: 'Низкая маржинальность проектов', p: 'Средняя маржа 18%, при этом 40% проектов убыточны.' },
        { b: 'Перегруженность собственника операционкой', p: '70% времени уходит на текущие вопросы вместо стратегии.' }
      ],
      cta: 'Показать полный анализ'
    }
  ]);
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const scrollRef = React.useRef(null);
  const firstRender = React.useRef(true);
  const replyIdx = React.useRef(0);

  React.useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  function nowTime() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function send(text) {
    const t = (text != null ? text : input).trim();
    if (!t) return;
    setMessages(m => [...m, { role: 'user', time: nowTime(), text: t }]);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      const reply = AI_REPLIES[replyIdx.current % AI_REPLIES.length];
      replyIdx.current++;
      setTyping(false);
      setMessages(m => [...m, { role: 'ai', time: nowTime(), text: reply }]);
    }, 1100);
  }

  React.useEffect(() => {
    if (seed) { send(seed); onSeedConsumed && onSeedConsumed(); }
  }, []);

  return (
    <div className="chat-wrap">
      <div className="chat-head">
        <button className="ic" title="История"><Icon name="clock" size={18} /></button>
        <button className="ic" title="Поделиться"><Icon name="share" size={18} /></button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        <div className="chat-inner">
          <h1 className="chat-hello rise">{greeting}, Алексей!</h1>
          <p className="chat-sub rise d1">Чем займёмся сегодня?</p>

          <div className="chips rise d2">
            {CHAT_SUGGESTIONS.map((s, i) => (
              <button key={i} className="chip-sug" onClick={() => send(s.text)}>
                <Icon name={s.icon} size={18} className="ic" />
                <span>{s.text}</span>
              </button>
            ))}
          </div>

          {messages.map((m, i) => (
            <div key={i} className={'msg ' + m.role}>
              {m.role === 'ai'
                ? <div className="ava shef" dangerouslySetInnerHTML={{ __html: window.SHEF_MONO }} />
                : <div className="ava">АС</div>}
              <div className="msg-body">
                {m.role === 'ai' && <div className="msg-name">ШЕФ<span className="role">· ИИ-ассистент</span><span className="t">{m.time}</span></div>}
                {m.role === 'ai' ? (
                  <div className="msg-text">
                    <div>{m.text}</div>
                    {m.list && (
                      <ul className="an-list">
                        {m.list.map((it, j) => (
                          <li key={j} className="an-item">
                            <span className="an-num">{j + 1}</span>
                            <div><b>{it.b}</b><p>{it.p}</p></div>
                          </li>
                        ))}
                      </ul>
                    )}
                    {m.cta && (
                      <div className="an-cta" onClick={() => onNav('clients')}>
                        <span>{m.cta}</span><Icon name="arrowRight" size={18} />
                      </div>
                    )}
                  </div>
                ) : (
                  <React.Fragment>
                    <div className="bubble">{m.text}</div>
                    <div className="t">{m.time} ✓✓</div>
                  </React.Fragment>
                )}
              </div>
            </div>
          ))}

          {typing && (
            <div className="msg ai">
              <div className="ava shef thinking" dangerouslySetInnerHTML={{ __html: window.SHEF_MONO }} />
              <div className="msg-body">
                <div className="msg-name">ШЕФ<span className="role">· ИИ-ассистент</span></div>
                <div className="msg-text" style={{ width: 'fit-content' }}>
                  <div className="typing"><span /><span /><span /></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <div className="quick">
            <button onClick={() => send('Что предложишь?')}><Icon name="sparkle" size={15} />Что предложишь?</button>
            <button onClick={() => send('Покажи план действий')}><Icon name="check" size={15} />Покажи план действий</button>
            <button onClick={() => send('Какие есть риски?')}><Icon name="flag" size={15} />Какие есть риски?</button>
          </div>
          <div className="composer-box">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') send(); }}
              placeholder="Напишите сообщение…" />
            <button className="ic-btn" title="Прикрепить"><Icon name="paperclip" size={19} /></button>
            <button className="ic-btn" title="Голос"><Icon name="mic" size={19} /></button>
            <button className="send" onClick={() => send()} title="Отправить"><Icon name="send" size={18} /></button>
          </div>
          <div className="disc">ИИ может ошибаться. Проверяйте важную информацию.</div>
        </div>
      </div>
    </div>
  );
}
window.ChatHome = ChatHome;
