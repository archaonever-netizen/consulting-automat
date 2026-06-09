import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

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
      const response = await api.post('/api/auth/login', { email, password });
      localStorage.setItem('access_token', response.data.access_token);
      navigate('/');
    } catch (err: any) {
      // detail может быть строкой (HTTPException) или массивом объектов (422).
      const detail = err.response?.data?.detail;
      let msg = 'Ошибка при входе';
      if (typeof detail === 'string') {
        msg = detail;
      } else if (Array.isArray(detail)) {
        msg = detail.map((d: any) => d?.msg).filter(Boolean).join('; ') || msg;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <svg className="logo" viewBox="0 0 82 44" xmlns="http://www.w3.org/2000/svg">
            <text x="8" y="34" className="logo-text" fontSize="32" fontWeight="800">ШЕФ</text>
          </svg>
          <h1>ШЕФ Консалтинг</h1>
          <p>Платформа для управления проектами и консалтингом</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="form-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Вход...' : 'Вход'}
          </button>
        </form>
      </div>
    </div>
  );
}
