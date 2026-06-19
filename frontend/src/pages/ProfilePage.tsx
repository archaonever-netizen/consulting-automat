import { useState, useEffect, type FormEvent } from 'react';
import { AxiosError } from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

interface User {
  id: number;
  email: string;
  full_name: string;
  is_founder: boolean;
}

interface TrackerConnection {
  connected: boolean;
  org_id?: string | null;
  cloud_org_id?: string | null;
  token_type?: 'oauth' | 'iam' | null;
  tracker_user_name?: string | null;
  tracker_email?: string | null;
  default_queue?: string | null;
}

type OrgMode = 'org' | 'cloud';
type TokenType = 'oauth' | 'iam';

function errorText(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const detail = (err.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
  }
  return fallback;
}

function trackerOauthMessage(search: string): { notice: string | null; error: string | null; clean: boolean } {
  const params = new URLSearchParams(search);
  const result = params.get('yandex_tracker');
  if (result === 'connected') {
    return { notice: 'Яндекс Трекер подключён через Яндекс ID.', error: null, clean: true };
  }
  if (result === 'error') {
    return {
      notice: null,
      error: params.get('message') || 'Не удалось подключить Яндекс ID',
      clean: true,
    };
  }
  return { notice: null, error: null, clean: false };
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialOauthMessage = trackerOauthMessage(location.search);
  const [user, setUser] = useState<User | null>(null);
  const [conn, setConn] = useState<TrackerConnection | null>(null);
  const [loading, setLoading] = useState(true);

  const [orgMode, setOrgMode] = useState<OrgMode>('org');
  const [orgId, setOrgId] = useState('');
  const [tokenType, setTokenType] = useState<TokenType>('oauth');
  const [defaultQueue, setDefaultQueue] = useState('');
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialOauthMessage.error);
  const [notice, setNotice] = useState<string | null>(initialOauthMessage.notice);

  useEffect(() => {
    Promise.all([
      api.get('/api/auth/me'),
      api.get('/api/tracker/connection'),
    ])
      .then(([u, c]) => { setUser(u.data); setConn(c.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (initialOauthMessage.clean) navigate('/profile', { replace: true });
  }, [initialOauthMessage.clean, navigate]);

  async function handleYandexIdConnect() {
    setOauthLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.get('/api/tracker/oauth/start');
      const url = response.data?.authorization_url;
      if (typeof url !== 'string' || !url) throw new Error('empty authorization_url');
      window.location.href = url;
    } catch (err) {
      setError(errorText(err, 'Не удалось начать подключение через Яндекс ID'));
      setOauthLoading(false);
    }
  }

  async function handleConnect(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const trimmedOrgId = orgId.trim();
      const payload = {
        token,
        token_type: orgMode === 'cloud' ? tokenType : 'oauth',
        org_id: orgMode === 'org' ? trimmedOrgId : undefined,
        cloud_org_id: orgMode === 'cloud' ? trimmedOrgId : undefined,
        default_queue: defaultQueue.trim() || undefined,
      };
      const r = await api.post('/api/tracker/connection', payload);
      setConn(r.data);
      setOrgId('');
      setToken('');
      setDefaultQueue('');
      setTokenType('oauth');
    } catch (err) {
      setError(errorText(err, 'Не удалось подключить Яндекс Трекер'));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setSaving(true);
    setError(null);
    try {
      await api.delete('/api/tracker/connection');
      setConn({ connected: false });
    } catch (err) {
      setError(errorText(err, 'Не удалось отключить Яндекс Трекер'));
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

  const orgLabel = orgMode === 'org' ? 'X-Org-ID' : 'X-Cloud-Org-ID';

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
        <div className="tracker-head">
          <div>
            <div className="eyebrow">Интеграция</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, marginTop: 4 }}>Яндекс Трекер</h2>
          </div>
          <span className={`pill ${conn?.connected ? 'pill-green' : 'pill-gray'}`}>
            {conn?.connected ? 'Подключён' : 'Не подключён'}
          </span>
        </div>

        {notice && <div className="tracker-notice">{notice}</div>}
        {error && <div className="tracker-error">{error}</div>}

        {conn?.connected ? (
          <div className="tracker-connected">
            <div className="prof-grid" style={{ marginTop: 14 }}>
              <div className="metric">
                <div className="k">Организация</div>
                <div className="v" style={{ fontSize: 15 }}>
                  {conn.org_id ? `X-Org-ID: ${conn.org_id}` : `X-Cloud-Org-ID: ${conn.cloud_org_id}`}
                </div>
              </div>
              <div className="metric"><div className="k">Тип токена</div><div className="v" style={{ fontSize: 15 }}>{conn.token_type === 'iam' ? 'IAM' : 'OAuth'}</div></div>
              {conn.tracker_user_name && (
                <div className="metric"><div className="k">Пользователь</div><div className="v" style={{ fontSize: 15 }}>{conn.tracker_user_name}</div></div>
              )}
              {conn.tracker_email && (
                <div className="metric"><div className="k">Email</div><div className="v" style={{ fontSize: 15 }}>{conn.tracker_email}</div></div>
              )}
              {conn.default_queue && (
                <div className="metric"><div className="k">Очередь по умолчанию</div><div className="v" style={{ fontSize: 15 }}>{conn.default_queue}</div></div>
              )}
            </div>
            <button className="btn btn-soft btn-sm" style={{ marginTop: 18 }} disabled={saving} onClick={handleDisconnect}>
              <Icon name="logout" size={15} />Отключить Яндекс Трекер
            </button>
          </div>
        ) : (
          <div>
            <div className="tracker-oauth-box">
              <p className="tracker-hint">
                Подключите Яндекс ID: приложение получит токен безопасно, привяжет его к вашему профилю и будет показывать задачи, доступные вашему аккаунту в Яндекс Трекере.
              </p>
              <button className="btn btn-primary" type="button" disabled={oauthLoading} onClick={handleYandexIdConnect}>
                <Icon name="check" size={16} />{oauthLoading ? 'Переход в Яндекс...' : 'Подключить через Яндекс ID'}
              </button>
            </div>

            <form className="tracker-form" onSubmit={handleConnect}>
              <div className="tracker-manual-head">
                <span>Ручное подключение</span>
                <small>Fallback для OAuth/IAM-токена</small>
              </div>
              <p className="tracker-hint">
                Если OAuth-приложение ещё не настроено, можно временно указать OAuth-токен или IAM-токен и id организации вручную.
              </p>
            <label className="field">
              <span>Тип организации</span>
              <select value={orgMode} onChange={e => { setOrgMode(e.target.value as OrgMode); setTokenType('oauth'); }}>
                <option value="org">Яндекс 360, X-Org-ID</option>
                <option value="cloud">Yandex Cloud, X-Cloud-Org-ID</option>
              </select>
            </label>
            <label className="field">
              <span>{orgLabel}</span>
              <input
                type="text"
                placeholder={orgMode === 'org' ? 'Например, 1234567' : 'Например, bpf...'}
                value={orgId}
                onChange={e => setOrgId(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Тип токена</span>
              <select value={orgMode === 'cloud' ? tokenType : 'oauth'} onChange={e => setTokenType(e.target.value as TokenType)} disabled={orgMode === 'org'}>
                <option value="oauth">OAuth</option>
                <option value="iam">IAM</option>
              </select>
            </label>
            <label className="field">
              <span>Очередь по умолчанию</span>
              <input
                type="text"
                placeholder="Например, TEST"
                value={defaultQueue}
                onChange={e => setDefaultQueue(e.target.value.toUpperCase())}
              />
            </label>
            <label className="field">
              <span>Токен</span>
              <input
                type="password"
                placeholder="Вставьте токен Яндекс Трекера"
                value={token}
                onChange={e => setToken(e.target.value)}
                required
              />
            </label>
            <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: 4 }}>
              <Icon name="check" size={16} />{saving ? 'Проверка...' : 'Подключить'}
            </button>
            </form>
          </div>
        )}
      </div>

      <style>{`
        .profile-card-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .profile-logout { color: var(--danger); border-color: var(--danger-weak); }
        .profile-logout:hover { color: var(--danger); background: var(--danger-weak); border-color: var(--danger); }
        .prof-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-top: 12px; }
        .tracker-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
        .tracker-oauth-box { display: flex; align-items: center; justify-content: space-between; gap: 14px; max-width: 720px; margin-top: 16px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface-2); }
        .tracker-oauth-box .tracker-hint { margin: 0; max-width: 470px; }
        .tracker-form { display: flex; flex-direction: column; gap: 14px; max-width: 520px; margin-top: 16px; }
        .tracker-manual-head { display: flex; align-items: baseline; gap: 10px; padding-top: 6px; border-top: 1px solid var(--line); }
        .tracker-manual-head span { font-size: 13px; font-weight: 800; color: var(--text-primary); }
        .tracker-manual-head small { font-size: 12px; color: var(--ink-4); }
        .tracker-hint { font-size: 13px; color: var(--ink-4); line-height: 1.55; }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field span { font-size: 12px; font-weight: 600; color: var(--ink-4); }
        .field input, .field select { padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 14px; color: var(--text-primary); transition: var(--transition); }
        .field input:focus, .field select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
        .field select:disabled { color: var(--ink-4); background: var(--surface-2); cursor: not-allowed; }
        .tracker-notice { margin-top: 14px; padding: 10px 12px; border-radius: 9px; background: #f0fdf4; color: #166534; font-size: 13px; border: 1px solid #bbf7d0; }
        .tracker-error { margin-top: 14px; padding: 10px 12px; border-radius: 9px; background: #fff1f0; color: #c0392b; font-size: 13px; border: 1px solid #ffd6d2; }
        @media (max-width: 760px) {
          .tracker-oauth-box { align-items: stretch; flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
