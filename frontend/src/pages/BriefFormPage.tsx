import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import SalesBrief, { type SalesQuestions } from '../components/SalesBrief';

interface Section {
  title: string;
  fields: string[];
}

interface Questions {
  title: string;
  sections?: Section[];
  type?: string;
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

  useEffect(() => {
    Promise.all([
      api.get(`/api/briefs/${briefId}`),
      api.get(`/api/briefs/${briefId}/questions`),
    ]).then(([briefRes, qRes]) => {
      setClientId(briefRes.data.client_id);
      setStatus(qRes.data.status ?? briefRes.data.status ?? 'Не заполнено');
      setQuestions(qRes.data.questions ?? null);
      setAnswers(qRes.data.answers || {});
    }).catch(() => navigate(-1)).finally(() => setLoading(false));
  }, [briefId, navigate]);

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

  function goBack() {
    if (clientId) navigate(`/clients/${clientId}`);
    else navigate(-1);
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  // Sales-бриф: отдельный UI с метриками и живым расчётом Health.
  if (questions?.type === 'sales') {
    return (
      <SalesBrief
        briefId={briefId!}
        questions={questions as unknown as SalesQuestions}
        initialAnswers={answers}
        initialStatus={status}
        clientId={clientId}
      />
    );
  }

  // Защита: questions может быть null или без sections (неизвестный тип брифа).
  const sections = questions?.sections ?? [];

  if (!questions || sections.length === 0) {
    return (
      <div className="page">
        <div className="detail-top">
          <button className="back" onClick={goBack}><Icon name="arrowLeft" size={18} />Назад</button>
        </div>
        <div className="empty-tab" style={{ marginTop: 22 }}>
          <div className="ei"><Icon name="doc" size={24} /></div>
          <b>Анкета недоступна</b>
          <span>Для этого типа брифа нет настроенной формы. Вернитесь к клиенту и создайте бриф заново.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 820 }}>
      <div className="page-head rise">
        <div>
          <button className="back" onClick={goBack} style={{ marginBottom: 10 }}><Icon name="arrowLeft" size={18} />Назад к клиенту</button>
          <h1>{questions.title}</h1>
        </div>
        <span className={`pill ${STATUS_CLS[status] || 'pill-gray'}`}>
          {status === 'Заполнено' && <span className="led" />}{status}
        </span>
      </div>

      <form onSubmit={e => handleSubmit(e)} id="briefForm">
        {sections.map((sec, si) => (
          <div key={si} className={`section-card rise d${Math.min(si + 1, 8)}`} style={{ marginBottom: 16 }}>
            <div className="sc-head"><div className="sc-title">{sec.title}</div></div>
            {(sec.fields ?? []).map(field => {
              const key = `${sec.title}||${field}`;
              return (
                <div key={field} className="form-group" style={{ marginBottom: 14 }}>
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
          className="brief-savebar"
          style={{
            position: 'sticky', bottom: 0, zIndex: 10,
            background: 'var(--glass-bg, rgba(255,255,255,0.75))',
            backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            border: '1px solid var(--line)', borderRadius: 18,
            margin: '12px 0', padding: '14px 18px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={e => handleSubmit(e, true)}>
              <Icon name="check" size={16} />Завершить анкету
            </button>
            <button type="submit" className="btn btn-ghost" disabled={saving}>Сохранить черновик</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {saved && <span style={{ fontSize: 13, color: 'var(--success)', fontWeight: 600 }}>✓ Сохранено</span>}
          </div>
        </div>
      </form>
    </div>
  );
}
