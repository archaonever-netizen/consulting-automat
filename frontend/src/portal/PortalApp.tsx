import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  portalApi, getToken, setToken, clearToken, PortalError,
  type PortalMe, type PortalData, type PortalDocument,
} from './api';

const SECTION_LABEL: Record<string, string> = {
  project: 'Проект',
  stages: 'Этапы проекта',
  status: 'Статус проекта',
  documents: 'Документы и файлы',
  events: 'События',
  info: 'Информация',
};

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

type Phase = 'loading' | 'login' | 'ready';

export default function PortalApp() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [me, setMe] = useState<PortalMe | null>(null);
  const [data, setData] = useState<PortalData>({});
  const [active, setActive] = useState<string>('');
  const [loadError, setLoadError] = useState('');

  const loadAll = useCallback(async () => {
    setPhase('loading');
    setLoadError('');
    try {
      const meData = await portalApi.me();
      const payload = await portalApi.data();
      setMe(meData);
      setData(payload);
      setActive(prev => (prev && meData.sections.includes(prev) ? prev : meData.sections[0] || ''));
      setPhase('ready');
    } catch (e) {
      if (e instanceof PortalError && e.status === 401) {
        setPhase('login');
      } else {
        setLoadError(e instanceof Error ? e.message : 'Ошибка загрузки');
        setPhase('login');
      }
    }
  }, []);

  // Старт: подхватываем preview-токен из ?preview=..., иначе — сохранённый токен.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const preview = params.get('preview');
    if (preview) {
      setToken(preview);
      params.delete('preview');
      const qs = params.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
    if (getToken()) {
      loadAll();
    } else {
      setPhase('login');
    }
  }, [loadAll]);

  function logout() {
    clearToken();
    setMe(null);
    setData({});
    setPhase('login');
  }

  if (phase === 'loading') {
    return <div className="pl-loading">Загрузка…</div>;
  }
  if (phase === 'login') {
    return <LoginScreen onSuccess={loadAll} initialError={loadError} />;
  }
  if (!me) return null;

  return (
    <div className="pl-shell">
      <div className="pl-topbar">
        <div className="pl-brand">
          {me.client_name || 'Портал проекта'}
          <small>Портал клиента</small>
        </div>
        <div className="pl-topbar-right">
          <div className="pl-user">
            <b>{me.full_name}</b>
            {!me.is_preview && <span>сотрудник клиента</span>}
          </div>
          <button className="pl-btn pl-btn-ghost" onClick={logout}>
            {me.is_preview ? 'Закрыть' : 'Выйти'}
          </button>
        </div>
      </div>

      {me.is_preview && (
        <div className="pl-preview-banner">
          Режим предпросмотра — так портал видит клиент. Видны все разделы.
        </div>
      )}

      <div className="pl-body">
        <nav className="pl-nav">
          {me.sections.map(s => (
            <button
              key={s}
              className={`pl-nav-item${active === s ? ' active' : ''}`}
              onClick={() => setActive(s)}
            >
              {SECTION_LABEL[s] || s}
            </button>
          ))}
        </nav>
        <main className="pl-main">
          <SectionView section={active} data={data} />
        </main>
      </div>
    </div>
  );
}

function SectionView({ section, data }: { section: string; data: PortalData }) {
  const title = SECTION_LABEL[section] || section;

  if (section === 'documents') {
    return <DocumentsSection docs={data.documents || []} />;
  }

  if (section === 'project') {
    const projects = data.project || [];
    return (
      <div className="pl-card">
        <h2 className="pl-h2">{title}</h2>
        <p className="pl-sub">Проекты по вашей компании.</p>
        {projects.length === 0 ? (
          <Empty title="Проектов пока нет" text="Здесь появятся проекты по мере их запуска." />
        ) : (
          projects.map(p => (
            <div key={p.id} className="pl-proj">
              <h3>{p.name}</h3>
              {p.description && <p>{p.description}</p>}
              <div className="meta">Обновлено: {p.updated_at_fmt}</div>
            </div>
          ))
        )}
      </div>
    );
  }

  // Разделы-скелеты: пока нет данных в системе.
  const placeholders: Record<string, string> = {
    stages: 'Этапы проекта появятся здесь по мере ведения работы.',
    status: 'Текущий статус проекта будет отображаться здесь.',
    events: 'Новости и важные события по проекту появятся здесь.',
    info: 'Справочная информация по проекту появится здесь.',
  };
  return (
    <div className="pl-card">
      <h2 className="pl-h2">{title}</h2>
      <Empty title="Раздел в подготовке" text={placeholders[section] || 'Раздел скоро наполнится.'} />
    </div>
  );
}

function DocumentsSection({ docs }: { docs: PortalDocument[] }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function download(doc: PortalDocument) {
    setBusyId(doc.id);
    setError('');
    try {
      await portalApi.download(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скачать файл');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="pl-card">
      <h2 className="pl-h2">Документы и файлы</h2>
      <p className="pl-sub">Материалы, которые ваша команда проекта подготовила для вас.</p>
      {error && <div className="pl-error">{error}</div>}
      {docs.length === 0 ? (
        <Empty title="Документов пока нет" text="Здесь появятся файлы, которыми с вами поделится команда." />
      ) : (
        <div>
          {docs.map(d => (
            <div key={d.id} className="pl-item">
              <div className="pl-item-main">
                <b>{d.title}</b>
                <span>{d.original_filename} · {humanSize(d.size_bytes)} · {d.created_at_fmt}</span>
              </div>
              <button className="pl-btn pl-btn-soft" disabled={busyId === d.id} onClick={() => download(d)}>
                {busyId === d.id ? 'Скачивание…' : 'Скачать'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="pl-empty">
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}

function LoginScreen({ onSuccess, initialError }: { onSuccess: () => void; initialError?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [loading, setLoading] = useState(false);

  // initialError может появиться при просроченном токене — показываем один раз.
  const initial = useMemo(() => initialError || '', [initialError]);
  useEffect(() => { if (initial) setError(initial); }, [initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await portalApi.login(email.trim(), password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pl-login">
      <form className="pl-login-card" onSubmit={submit}>
        <h1>Вход в портал</h1>
        <p className="sub">Введите логин и пароль, которые вам выдала команда проекта.</p>
        {error && <div className="pl-error">{error}</div>}
        <div className="pl-field">
          <label htmlFor="pl-email">Email</label>
          <input id="pl-email" className="pl-input" type="email" value={email}
            onChange={e => setEmail(e.target.value)} required disabled={loading} autoComplete="username" />
        </div>
        <div className="pl-field">
          <label htmlFor="pl-pass">Пароль</label>
          <input id="pl-pass" className="pl-input" type="password" value={password}
            onChange={e => setPassword(e.target.value)} required disabled={loading} autoComplete="current-password" />
        </div>
        <button className="pl-btn pl-btn-primary" type="submit" disabled={loading}>
          {loading ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
