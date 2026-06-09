import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Section {
  title: string;
  fields: string[];
}

interface Questions {
  title: string;
  sections: Section[];
}

const STATUS_CLS: Record<string, string> = {
  'Заполнено': 'pill-green',
  'В работе': 'pill-amber',
  'Не заполнено': 'pill-gray',
};

export default function BriefFormPage() {
  const { briefId } = useParams<{ briefId: string }>();
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<Questions | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('Не заполнено');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const stickyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      api.get(`/api/briefs/${briefId}`),
      api.get(`/api/briefs/${briefId}/questions`),
    ]).then(([briefRes, qRes]) => {
      setClientId(briefRes.data.client_id);
      setStatus(briefRes.data.status);
      setQuestions(qRes.data.questions);
      setAnswers(qRes.data.answers || {});
    }).catch(() => navigate(-1)).finally(() => setLoading(false));
  }, [briefId, navigate]);

  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const onScroll = () => {
      const rect = el.getBoundingClientRect();
      const isSticky = window.innerHeight - rect.bottom < rect.height;
      el.classList.toggle('is-floating', isSticky);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [loading]);

  function handleChange(section: string, field: string, value: string) {
    setAnswers(prev => ({ ...prev, [`${section}||${field}`]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent, complete?: boolean) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/api/briefs/${briefId}`, {
        answers,
        status: complete ? 'Заполнено' : undefined,
      });
      setSaved(true);
      if (complete) {
        setStatus('Заполнено');
        setTimeout(() => {
          if (clientId) navigate(`/clients/${clientId}`);
        }, 800);
      }
    } catch {
      alert('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;
  if (!questions) return null;

  return (
    <div className="page-wrapper" style={{ maxWidth: 800 }}>
      <div className="header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">{questions.title}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className={`badge ${STATUS_CLS[status] || 'pill-gray'}`}>
            <span className="led"></span>{status}
          </span>
        </div>
      </div>

      <form onSubmit={e => handleSubmit(e)} id="briefForm">
        {questions.sections.map((sec, si) => (
          <div key={si} className={`card animate-in stagger-${Math.min(si + 1, 20)}`} style={{ marginBottom: '1.5rem' }}>
            <div className="section-title" style={{ marginBottom: '1rem' }}>{sec.title}</div>
            {sec.fields.map(field => {
              const key = `${sec.title}||${field}`;
              return (
                <div key={field} className="form-group">
                  <label className="form-label" htmlFor={key}>{field}</label>
                  <textarea
                    className="form-textarea"
                    id={key}
                    rows={2}
                    value={answers[key] || ''}
                    onChange={e => handleChange(sec.title, field, e.target.value)}
                  />
                </div>
              );
            })}
          </div>
        ))}

        <div
          ref={stickyRef}
          className="sticky-panel"
          style={{
            position: 'sticky', bottom: 0, zIndex: 10,
            background: 'rgba(255,255,255,0.75)',
            backdropFilter: 'blur(12px)',
            borderRadius: 20,
            margin: '0 0.5rem 0.5rem 0.5rem',
            padding: '1rem 1.5rem',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={e => handleSubmit(e, true)}
            >
              {saving ? <span className="spinner"></span> : null}
              <span className="btn-text">Завершить анкету</span>
            </button>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={saving}
            >
              Сохранить черновик
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {saved && <span style={{ fontSize: 13, color: 'var(--success, #16a34a)' }}>✓ Сохранено</span>}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => clientId ? navigate(`/clients/${clientId}`) : navigate(-1)}
            >
              Назад
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
