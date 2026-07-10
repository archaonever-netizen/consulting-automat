import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Suspense, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
  { to: '/secretary', label: 'Секретарь', icon: 'send' },
  { to: '/clients', label: 'Клиенты', icon: 'users' },
  { to: '/leads', label: 'Заявки', icon: 'feedback' },
  { to: '/projects', label: 'Проекты', icon: 'template' },
  { to: '/goals', label: 'Цели', icon: 'trendUp' },
  { to: '/orchestration', label: 'Сеть агентов', icon: 'sparkle' },
  { to: '/tasks', label: 'Задачи', icon: 'check' },
  { to: '/tracker', label: 'Трекер', icon: 'grid' },
  { to: '/employees', label: 'ИИ-Сотрудники', icon: 'bolt', founderOnly: true },
  { to: '/company', label: 'Компания', icon: 'chart', founderOnly: true },
  { to: '/knowledge', label: 'База знаний', icon: 'book' },
];

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === '1');
  const [projectSidebarExpanded, setProjectSidebarExpanded] = useState(false);
  const isProjectWorkspaceRoute = /^\/projects\/[^/]+/.test(location.pathname);
  const sidebarCollapsed = collapsed || (isProjectWorkspaceRoute && !projectSidebarExpanded);
  // Общий ключ ['me'] с HomePage/KnowledgePage: профиль грузится один раз
  // и держится 5 минут — каркас при переходах рисуется мгновенно.
  const { data: user, isLoading: loading, isError } = useQuery<User>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/api/auth/me')).data,
    staleTime: 5 * 60_000,
  });
  useEffect(() => { if (isError) navigate('/login'); }, [isError, navigate]);
  useEffect(() => { setProjectSidebarExpanded(false); }, [location.pathname]);

  function toggleSidebar() {
    if (isProjectWorkspaceRoute) {
      if (sidebarCollapsed) {
        if (collapsed) {
          localStorage.setItem('sidebar_collapsed', '0');
          setCollapsed(false);
        }
        setProjectSidebarExpanded(true);
        return;
      }
      setProjectSidebarExpanded(false);
      return;
    }

    setCollapsed(current => {
      const next = !current;
      localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }

  if (loading) return <div className="app"><div className="loading-bar"></div></div>;

  const items = NAV.filter(i => !i.founderOnly || user?.is_founder);

  return (
    <div className="app">
      <aside className={'sidebar' + (sidebarCollapsed ? ' sb-collapsed' : '')}>
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
          <button
            className="sb-collapse-toggle"
            title={sidebarCollapsed ? 'Развернуть' : 'Свернуть'}
            aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-pressed={sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <Icon name="arrowLeft" size={18} />
          </button>
        </div>

        <button className="sb-user" onClick={() => navigate('/profile')} title="Профиль"
          style={{ width: '100%', font: 'inherit', background: 'transparent', textAlign: 'left' }}>
          <span className="sb-av" style={{ background: 'var(--accent)' }}>
            {initials(user?.full_name || '')}
          </span>
          <span className="sb-meta">
            <b>{user?.full_name}</b>
            <span>{user?.is_founder ? 'Основатель' : 'Сотрудник'}</span>
          </span>
          <Icon name="dots" size={16} className="sb-chev" />
        </button>
      </aside>

      <main className="main" id="mainContent">
        {/* Suspense внутри main: при докачке ленивой страницы сайдбар остаётся на месте */}
        <Suspense fallback={<div className="page"><div className="loading-bar active" /></div>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
