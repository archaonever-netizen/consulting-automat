import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../services/api';

interface User {
  id: number;
  email: string;
  full_name: string;
  is_founder: boolean;
  is_active: boolean;
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-top">
          <svg className="logo" viewBox="0 0 82 44" xmlns="http://www.w3.org/2000/svg">
            <text x="8" y="34" className="logo-text" fontSize="32" fontWeight="800">ШЕФ</text>
          </svg>
        </div>

        <nav className="sb-nav">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? 'sb-navitem active' : 'sb-navitem'
            }
            end
          >
            Главная
          </NavLink>
          <NavLink
            to="/clients"
            className={({ isActive }) =>
              isActive ? 'sb-navitem active' : 'sb-navitem'
            }
          >
            Клиенты
          </NavLink>
          {user?.is_founder && (
            <NavLink
              to="/company"
              className={({ isActive }) =>
                isActive ? 'sb-navitem active' : 'sb-navitem'
              }
            >
              Компания
            </NavLink>
          )}
          <NavLink
            to="/tasks"
            className={({ isActive }) =>
              isActive ? 'sb-navitem active' : 'sb-navitem'
            }
          >
            Задачи
          </NavLink>
          <NavLink
            to="/chat"
            className={({ isActive }) =>
              isActive ? 'sb-navitem active' : 'sb-navitem'
            }
          >
            ИИ-Чат
          </NavLink>
          <NavLink
            to="/orchestration"
            className={({ isActive }) =>
              isActive ? 'sb-navitem active' : 'sb-navitem'
            }
          >
            Сеть агентов
          </NavLink>
        </nav>

        <div className="sb-bottom">
          <div className="sb-user">
            <div className="user-initials">
              {user?.full_name
                .split(' ')
                .slice(0, 2)
                .map(w => w[0])
                .join('')
                .toUpperCase()}
            </div>
            <div className="user-info">
              <p className="user-name">{user?.full_name}</p>
              <p className="user-role">
                {user?.is_founder ? 'Основатель' : 'Сотрудник'}
              </p>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Выход">
            ⎋
          </button>
        </div>
      </aside>

      <main className="main" id="mainContent">
        <Outlet />
      </main>
    </div>
  );
}
