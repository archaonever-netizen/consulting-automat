// Sidebar — app shell navigation
function Sidebar({ active, onNav, onNewChat }) {
  const { nav, user } = window.SHEF;
  return (
    <aside className="sidebar">
      <div className="sb-logo">
        <span className="mark-wrap" dangerouslySetInnerHTML={{ __html: window.SHEF_LOGO }} />
        <span className="tag">ИИ-КОНСАЛТИНГ</span>
      </div>

      <button className="sb-newchat" onClick={onNewChat}>
        <Icon name="plus" size={17} />
        <span>Новый чат</span>
        <span className="kbd">⌘K</span>
      </button>

      <nav className="sb-nav">
        {nav.map(item => (
          <a key={item.key} className={'sb-navitem' + (active === item.key ? ' active' : '')}
             onClick={() => onNav(item.key)}>
            <Icon name={item.icon} size={19} stroke={1.9} />
            <span>{item.label}</span>
            {item.dot && <span className="dot" />}
            {item.count != null && <span className="count">{item.count}</span>}
          </a>
        ))}
      </nav>

      <div className="sb-spacer" />

      <div className="sb-foot">
        <button title="Тема"><Icon name="sun" size={18} /></button>
        <button title="Помощь"><Icon name="help" size={18} /></button>
        <button title="Обратная связь"><Icon name="feedback" size={18} /></button>
        <span className="grow" />
        <button title="Свернуть"><Icon name="collapse" size={18} /></button>
      </div>

      <div className="sb-user">
        <span className="av" style={{ background: user.color }}>{user.initials}</span>
        <span className="meta">
          <b>{user.name}</b>
          <span>{user.role}</span>
        </span>
        <Icon name="dots" size={16} className="chev" />
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;
