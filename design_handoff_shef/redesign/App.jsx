// App — shell + routing + client state
const STORE = 'shef_redesign_v1';
const PALETTE = ['#1D1D1F', '#2563EB', '#16A34A', '#7C3AED', '#0891B2', '#DB2777', '#EA580C'];

function loadClients() {
  try { const r = localStorage.getItem(STORE); if (r) return JSON.parse(r); } catch (e) {}
  return JSON.parse(JSON.stringify(window.SHEF.clients));
}

function ClientModal({ initial, onClose, onSave }) {
  const [name, setName] = React.useState(initial ? initial.name : '');
  const [industry, setIndustry] = React.useState(initial ? initial.industry : '');
  const [city, setCity] = React.useState(initial ? initial.city : '');
  const ref = React.useRef(null);
  React.useEffect(() => { ref.current && ref.current.focus(); }, []);
  function submit() {
    if (!name.trim()) { ref.current && ref.current.focus(); return; }
    onSave({ name: name.trim(), industry: industry.trim() || 'Не указано', city: city.trim() || '—' });
  }
  return (
    <div className="overlay" onClick={e => { if (e.target.className === 'overlay') onClose(); }}>
      <div className="modal">
        <h3>{initial ? 'Редактировать клиента' : 'Новый клиент'}</h3>
        <p>{initial ? 'Обновите данные карточки клиента.' : 'Добавьте бизнес в картотеку — ИИ подготовит брифы и начнёт анализ.'}</p>
        <label>Название компании / ИП</label>
        <input ref={ref} value={name} onChange={e => setName(e.target.value)} placeholder="Например, ТехноСтрой" onKeyDown={e => e.key === 'Enter' && submit()} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <div><label>Отрасль</label><input value={industry} onChange={e => setIndustry(e.target.value)} placeholder="Строительство" onKeyDown={e => e.key === 'Enter' && submit()} /></div>
          <div><label>Город</label><input value={city} onChange={e => setCity(e.target.value)} placeholder="Москва" onKeyDown={e => e.key === 'Enter' && submit()} /></div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={submit}>{initial ? 'Сохранить' : 'Создать'}</button>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({ client, onClose, onConfirm }) {
  return (
    <div className="overlay" onClick={e => { if (e.target.className === 'overlay') onClose(); }}>
      <div className="modal">
        <h3>Удалить клиента?</h3>
        <p>Клиент «{client.name}» и все его брифы будут удалены без возможности восстановления.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" style={{ background: 'var(--red)', boxShadow: 'none' }} onClick={onConfirm}>Удалить</button>
        </div>
      </div>
    </div>
  );
}

function Placeholder({ title, icon, sub }) {
  return (
    <div className="page">
      <div className="page-head"><div><h1>{title}</h1><p>{sub}</p></div></div>
      <div className="empty-tab" style={{ padding: '90px 20px' }}>
        <div className="ei"><Icon name={icon} size={24} /></div>
        <b>Раздел в разработке</b>
        <span>Этот раздел появится на следующих итерациях редизайна</span>
      </div>
    </div>
  );
}

function App() {
  const [active, setActive] = React.useState('home');
  const [openId, setOpenId] = React.useState(null);
  const [clients, setClients] = React.useState(loadClients);
  const [modal, setModal] = React.useState(null);   // {mode:'add'|'edit', client}
  const [confirm, setConfirm] = React.useState(null);
  const [toasts, setToasts] = React.useState([]);
  const [chatSeed, setChatSeed] = React.useState(null);

  React.useEffect(() => { localStorage.setItem(STORE, JSON.stringify(clients)); }, [clients]);

  function toast(msg) {
    const id = Math.random();
    setToasts(t => [...t, { id, msg }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }

  function nav(key) { setOpenId(null); setActive(key); }
  function newChat() { setOpenId(null); setChatSeed(null); setActive('chats'); }
  function askChat(text) { setOpenId(null); setChatSeed(text); setActive('chats'); }

  function saveClient(data) {
    if (modal.mode === 'edit') {
      setClients(cs => cs.map(c => c.id === modal.client.id ? { ...c, ...data, initials: initials(data.name) } : c));
      toast('Изменения сохранены');
    } else {
      const id = Math.max(0, ...clients.map(c => c.id)) + 1;
      const c = {
        id, name: data.name, initials: initials(data.name), color: PALETTE[id % PALETTE.length],
        industry: data.industry, city: data.city, status: 'Новый', tags: ['Новый'],
        health: 0, trend: '0', spark: [0,0,0,0,0,0,0,0,0,0],
        metrics: [
          { label: 'Выручка (мес.)', value: '—', delta: '', dir: 'flat' },
          { label: 'Брифы', value: '0 / 3', delta: '', dir: 'flat' },
          { label: 'Статус', value: 'Новый', delta: '', dir: 'flat' }
        ],
        problems: [], steps: [{ title: 'Провести входной брифинг', desc: 'Заполнить «Бизнес-портрет» и «Точку А»' }],
        activity: [{ time: 'сейчас', text: 'Клиент добавлен в систему', kind: 'edit' }],
        briefs: { briefing: 'Не заполнено', point_a: 'Не заполнено', docs: 'Не заполнено' },
        owner: window.SHEF.user.name, lastContact: 'нет контакта'
      };
      setClients(cs => [c, ...cs]);
      toast('Клиент создан');
    }
    setModal(null);
  }

  function initials(name) {
    const parts = name.replace(/[«»"]/g, '').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function doDelete() {
    const id = confirm.id;
    setClients(cs => cs.filter(c => c.id !== id));
    if (openId === id) setOpenId(null);
    setConfirm(null);
    toast('Клиент удалён');
  }

  const openClient = openId != null ? clients.find(c => c.id === openId) : null;

  let content;
  if (active === 'home') {
    content = <HomeView clients={clients} user={window.SHEF.user} onNav={nav} onOpenClient={id => { setActive('clients'); setOpenId(id); }} onAsk={askChat} />;
  } else if (active === 'chats') {
    content = <ChatHome onNav={nav} seed={chatSeed} onSeedConsumed={() => setChatSeed(null)} />;
  } else if (active === 'clients') {
    content = openClient
      ? <ClientDetail client={openClient} onBack={() => setOpenId(null)} onOpenBrief={k => toast('Открываю анкету «' + k + '»')} onNewChat={newChat} onToast={toast} />
      : <ClientsList clients={clients} onOpen={setOpenId} onAdd={() => setModal({ mode: 'add' })} onEdit={c => setModal({ mode: 'edit', client: c })} onDelete={c => setConfirm(c)} />;
  } else if (active === 'analytics') {
    content = <Placeholder title="Аналитика" icon="chart" sub="Сводные показатели по всем клиентам и портфелю." />;
  } else if (active === 'tasks') {
    content = <Placeholder title="Задачи" icon="check" sub="Задачи и планы действий, в том числе сформированные ИИ." />;
  } else if (active === 'templates') {
    content = <Placeholder title="Шаблоны" icon="template" sub="Шаблоны брифов, отчётов и коммуникаций." />;
  } else if (active === 'kb') {
    content = <Placeholder title="База знаний" icon="book" sub="Методики, материалы и наработки консалтинга." />;
  } else {
    content = <Placeholder title="Настройки" icon="gear" sub="Профиль, команда, интеграции и доступы." />;
  }

  return (
    <div className="app">
      <Sidebar active={active} onNav={nav} onNewChat={newChat} />
      <main className="main">{content}</main>

      {modal && <ClientModal initial={modal.mode === 'edit' ? modal.client : null} onClose={() => setModal(null)} onSave={saveClient} />}
      {confirm && <ConfirmModal client={confirm} onClose={() => setConfirm(null)} onConfirm={doDelete} />}

      <div className="toasts">
        {toasts.map(t => <div key={t.id} className="toast2"><span className="led" />{t.msg}</div>)}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
