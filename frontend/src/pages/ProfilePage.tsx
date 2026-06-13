import { useState, useEffect, type FormEvent } from 'react';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

interface User {
  id: number;
  email: string;
  full_name: string;
  is_founder: boolean;
}

interface KaitenConnection {
  connected: boolean;
  domain?: string | null;
  kaiten_user_name?: string | null;
  kaiten_email?: string | null;
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [conn, setConn] = useState<KaitenConnection | null>(null);
  const [loading, setLoading] = useState(true);

  const [domain, setDomain] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/api/auth/me'),
      api.get('/api/kaiten/connection'),
    ])
      .then(([u, c]) => { setUser(u.data); setConn(c.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post('/api/kaiten/connection', { domain, token });
      setConn(r.data);
      setDomain('');
      setToken('');
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : null;
      setError(detail || 'Не удалось подключить Kaiten');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    try {
      await api.delete('/api/kaiten/connection');
      setConn({ connected: false });
    } catch (err) {
      const detail = err instanceof AxiosError ? (err.response?.data as { detail?: string } | undefined)?.detail : null;
      setError(detail || 'Не удалось отключить Kaiten');
    } finally {
      setSaving(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('access_token');
    queryClient.clear();
    navigate('/login');
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-head rise">
        <div>
          <h1>Профиль</h1>
          <p>Данные пользователя и интеграции с внешними сервисами.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <div className="profile-card-head">
          <div className="eyebrow">Пользователь</div>
          <button className="btn btn-ghost btn-sm profile-logout" type="button" onClick={handleLogout}>
            <Icon name="logout" size={15} />Выйти из аккаунта
          </button>
        </div>
        <div className="prof-grid">
          <div className="metric"><div className="k">Имя</div><div className="v" style={{ fontSize: 15 }}>{user?.full_name}</div></div>
          <div className="metric"><div className="k">Email</div><div className="v" style={{ fontSize: 15 }}>{user?.email}</div></div>
          <div className="metric"><div className="k">Роль</div><div className="v" style={{ fontSize: 15 }}>{user?.is_founder ? 'Основатель' : 'Сотрудник'}</div></div>
        </div>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div className="kaiten-head">
          <div>
            <div className="eyebrow">Интеграция</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>Kaiten — трекер задач</h2>
          </div>
          <span className={`pill ${conn?.connected ? 'pill-green' : 'pill-gray'}`}>
            {conn?.connected ? 'Подключён' : 'Не подключён'}
          </span>
        </div>

        {error && <div className="kaiten-error">{error}</div>}

        {conn?.connected ? (
          <div className="kaiten-connected">
            <div className="prof-grid" style={{ marginTop: 14 }}>
              <div className="metric"><div className="k">Домен</div><div className="v" style={{ fontSize: 15 }}>{conn.domain}</div></div>
              {conn.kaiten_user_name && (
                <div className="metric"><div className="k">Пользователь Kaiten</div><div className="v" style={{ fontSize: 15 }}>{conn.kaiten_user_name}</div></div>
              )}
              {conn.kaiten_email && (
                <div className="metric"><div className="k">Email Kaiten</div><div className="v" style={{ fontSize: 15 }}>{conn.kaiten_email}</div></div>
              )}
            </div>
            <button className="btn btn-soft btn-sm" style={{ marginTop: 18 }} disabled={saving} onClick={handleDisconnect}>
              <Icon name="logout" size={15} />Отключить Kaiten
            </button>
          </div>
        ) : (
          <form className="kaiten-form" onSubmit={handleConnect}>
            <p className="kaiten-hint">
              Укажите домен вашего пространства Kaiten и персональный API-токен
              (профиль Kaiten → раздел API-ключ). Токен хранится в зашифрованном виде.
            </p>
            <label className="field">
              <span>Домен</span>
              <input
                type="text"
                placeholder="company.kaiten.ru"
                value={domain}
                onChange={e => setDomain(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>API-токен</span>
              <input
                type="password"
                placeholder="Вставьте токен из профиля Kaiten"
                value={token}
                onChange={e => setToken(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
              <Icon name="check" size={16} />{saving ? 'Проверка…' : 'Подключить'}
            </button>
          </form>
        )}
      </div>

      <style>{`
        .profile-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .profile-logout { color: var(--danger); border-color: var(--danger-weak); }
        .profile-logout:hover { color: var(--danger); background: var(--danger-weak); border-color: var(--danger); }
        .prof-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-top: 12px; }
        .kaiten-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .kaiten-form { display: flex; flex-direction: column; gap: 14px; max-width: 460px; margin-top: 16px; }
        .kaiten-hint { font-size: 13px; color: var(--ink-4); line-height: 1.55; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field span { font-size: 12px; font-weight: 600; color: var(--ink-4); }
        .field input { padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 14px; color: var(--text-primary); transition: var(--transition); }
        .field input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
        .kaiten-error { margin-top: 14px; padding: 10px 12px; border-radius: 9px; background: #fff1f0; color: #c0392b; font-size: 13px; border: 1px solid #ffd6d2; }
      `}</style>
    </div>
  );
}
