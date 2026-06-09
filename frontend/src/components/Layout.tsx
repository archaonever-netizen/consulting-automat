import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../services/api';
import Icon from './Icon';
import { ShefWordmark } from './Logo';

interface User {
  id: number;
  email: string;
  full_name: string;
  is_founder: boolean;
  is_active: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  founderOnly?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Главная', icon: 'home', end: true },
  { to: '/chat', label: 'ИИ-Чат', icon: 'chat' },
  { to: '/clients', label: 'Клиенты', icon: 'users' },
  { to: '/orchestration', label: 'Сеть агентов', icon: 'sparkle' },
  { to: '/tasks', label: 'Задачи', icon: 'check' },
  { to: '/company', label: 'Компания', icon: 'chart', founderOnly: true },
];

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Layout() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/auth/me')
      .then(r => setUser(r.data))
      .catch(() => navigate('/login'))
      .finally(() => setLoading(false));
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem('access_token');
    navigate('/login');
  }

  if (loading) return <div className="app"><div className="loading-bar"></div></div>;

  const items = NAV.filter(i => !i.founderOnly || user?.is_founder);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-logo">
          <ShefWordmark className="sb-mark" />
          <span className="tag">ИИ-консалтинг</span>
        </div>

        <button className="sb-newchat" onClick={() => navigate('/chat')}>
          <Icon name="plus" size={17} />
          <span className="sb-nc-label">Новый чат</span>
        </button>

        <nav className="sb-nav">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => 'sb-navitem' + (isActive ? ' active' : '')}
            >
              <Icon name={item.icon} size={19} stroke={1.9} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sb-spacer" />

        <div className="sb-foot">
          <button title="Главная" onClick={() => navigate('/')}><Icon name="home" size={18} /></button>
          <button title="Помощь"><Icon name="help" size={18} /></button>
          <span className="grow" />
          <button title="Выход" onClick={handleLogout}><Icon name="logout" size={18} /></button>
        </div>

        <div className="sb-user">
          <span className="sb-av" style={{ background: 'var(--accent)' }}>
            {initials(user?.full_name || '')}
          </span>
          <span className="sb-meta">
            <b>{user?.full_name}</b>
            <span>{user?.is_founder ? 'Основатель' : 'Сотрудник'}</span>
          </span>
          <Icon name="dots" size={16} className="sb-chev" />
        </div>
      </aside>

      <main className="main" id="mainContent">
        <Outlet />
      </main>
    </div>
  );
}
