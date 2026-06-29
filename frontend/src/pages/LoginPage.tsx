import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import { ShefWordmark } from '../components/Logo';

interface ApiValidationDetail {
  msg?: string;
}

interface ApiErrorResponse {
  detail?: string | ApiValidationDetail[];
}

interface LoginResponse {
  access_token: string;
  token_type?: string;
  session_type?: 'app' | 'portal';
  redirect_to?: string | null;
}

function getLoginErrorMessage(err: unknown): string {
  const fallback = 'Ошибка при входе';
  const response = (err as { response?: { data?: ApiErrorResponse } }).response;
  const detail = response?.data?.detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg).filter(Boolean).join('; ') || fallback;
  }

  return fallback;
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/api/auth/login', { email: email.trim(), password });
      const data = response.data as LoginResponse;
      if (data.session_type === 'portal') {
        localStorage.removeItem('access_token');
        localStorage.setItem('portal_token', data.access_token);
        window.location.assign(data.redirect_to || '/portal.html');
        return;
      }
      localStorage.removeItem('portal_token');
      localStorage.setItem('access_token', data.access_token);
      navigate('/');
    } catch (err: unknown) {
      setError(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-copy">
          <ShefWordmark className="login-wordmark" />
          <p className="login-kicker">ИИ-консалтинг</p>
          <h1>ШЕФ Консалтинг</h1>
          <p>Единое рабочее пространство команды.</p>
        </div>

        <form onSubmit={handleSubmit} className="login-container" noValidate>
          <div className="login-header">
            <span className="login-form-mark"><ShefWordmark /></span>
            <h2>Вход в приложение</h2>
            <p>Используйте корпоративный email и пароль.</p>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.ru"
              required
              disabled={loading}
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Введите пароль"
              required
              disabled={loading}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Вход...</span>
              </>
            ) : (
              <>
                <span>Войти</span>
                <Icon name="arrowRight" size={17} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
