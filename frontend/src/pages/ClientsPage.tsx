import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface ClientListItem {
  id: number;
  name: string;
  initials: string;
  color: string;
  health: number;
  health_label: string;
  health_cls: string;
  ring_filled: number;
  ring_empty: number;
  done: number;
  total: number;
  bd_briefing: string;
  bd_point_a: string;
  bd_docs: string;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .get('/api/clients')
      .then(r => setClients(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.post('/api/clients', { name: newName.trim() });
      const r = await api.get('/api/clients');
      setClients(r.data);
      setShowModal(false);
      setNewName('');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка создания клиента');
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-header rise">
        <div>
          <h1 className="text-h1">Клиенты</h1>
          <p className="text-body">Картотека бизнесов под управлением.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>Добавить клиента</button>
        </div>
      </div>

      <div className="clients-list">
        {clients.length === 0 ? (
          <div className="empty-state">
            <p>Нет клиентов. Начните с добавления нового.</p>
          </div>
        ) : (
          clients.map((c) => (
            <Link
              key={c.id}
              to={`/clients/${c.id}`}
              className="client-item"
            >
              {/* Avatar & Name */}
              <div className="client-head">
                <div
                  className={`client-avatar health-${c.health_cls}`}
                  style={{ backgroundColor: c.color }}
                  title={c.health_label}
                >
                  <span className="avatar-text">{c.initials}</span>
                </div>
                <div className="client-meta">
                  <h3 className="client-name">{c.name}</h3>
                  <p className="client-health">
                    <span className={`badge health-${c.health_cls}`}>
                      {c.health}% — {c.health_label}
                    </span>
                  </p>
                </div>
              </div>

              {/* Health Ring */}
              <div className="client-ring">
                <svg viewBox="0 0 42 42" className="ring-svg">
                  <circle
                    cx="21"
                    cy="21"
                    r="18"
                    className="ring-bg"
                    fill="none"
                    strokeWidth="2"
                  />
                  <circle
                    cx="21"
                    cy="21"
                    r="18"
                    className={`ring-fill ring-${c.health_cls}`}
                    fill="none"
                    strokeWidth="2"
                    strokeDasharray={`${c.ring_filled} ${c.ring_empty}`}
                    strokeLinecap="round"
                  />
                </svg>
              </div>

              {/* Brief Status Dots */}
              <div className="client-briefs">
                <div className="brief-label">Брифы:</div>
                <div className="brief-dots">
                  <div
                    className={`brief-dot bd-${c.bd_briefing}`}
                    title="Брифинг"
                  />
                  <div
                    className={`brief-dot bd-${c.bd_point_a}`}
                    title="Точка А"
                  />
                  <div
                    className={`brief-dot bd-${c.bd_docs}`}
                    title="Документы"
                  />
                </div>
              </div>

              {/* Stats */}
              <div className="client-stats">
                <div className="stat">
                  <span className="stat-label">Заполнено:</span>
                  <span className="stat-value">
                    {c.done}/{c.total}
                  </span>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      <style>{`
        .clients-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .client-item {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: center;
          gap: 1.5rem;
          padding: 1rem;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: var(--radius-md, 8px);
          border-left: 4px solid;
          text-decoration: none;
          color: inherit;
          transition: all 0.2s ease;
          cursor: pointer;
        }

        .client-item:hover {
          background: var(--bg-secondary-hover, #eee);
          transform: translateX(4px);
        }

        .client-head {
          display: flex;
          align-items: center;
          gap: 1rem;
          min-width: 0;
        }

        .client-avatar {
          flex-shrink: 0;
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 18px;
        }

        .client-avatar.health-up {
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
        }

        .client-avatar.health-warn {
          box-shadow: 0 0 0 2px rgba(194, 116, 11, 0.2);
        }

        .client-avatar.health-down {
          box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.2);
        }

        .avatar-text {
          display: block;
        }

        .client-meta {
          flex: 1;
          min-width: 0;
        }

        .client-name {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .client-health {
          margin: 0.25rem 0 0 0;
        }

        .badge {
          display: inline-block;
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 500;
        }

        .badge.health-up {
          background: rgba(22, 163, 74, 0.1);
          color: #16a34a;
        }

        .badge.health-warn {
          background: rgba(194, 116, 11, 0.1);
          color: #c2740b;
        }

        .badge.health-down {
          background: rgba(220, 38, 38, 0.1);
          color: #dc2626;
        }

        .badge.health-flat {
          background: rgba(191, 192, 199, 0.1);
          color: #6b7280;
        }

        .client-ring {
          flex-shrink: 0;
          width: 60px;
          height: 60px;
        }

        .ring-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .ring-bg {
          stroke: var(--border-color, #e0e0e0);
        }

        .ring-fill.ring-up {
          stroke: #16a34a;
        }

        .ring-fill.ring-warn {
          stroke: #c2740b;
        }

        .ring-fill.ring-down {
          stroke: #dc2626;
        }

        .ring-fill.ring-flat {
          stroke: #bfc0c7;
        }

        .client-briefs {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }

        .brief-label {
          font-size: 12px;
          color: var(--text-secondary, #666);
          font-weight: 500;
          white-space: nowrap;
        }

        .brief-dots {
          display: flex;
          gap: 0.5rem;
        }

        .brief-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          transition: all 0.2s ease;
        }

        .brief-dot.bd-done {
          background: #16a34a;
        }

        .brief-dot.bd-work {
          background: #c2740b;
        }

        .brief-dot.bd-none {
          background: #e0e0e0;
        }

        .client-stats {
          flex-shrink: 0;
          display: flex;
          gap: 1rem;
          font-size: 13px;
        }

        .stat {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .stat-label {
          color: var(--text-secondary, #666);
          margin-bottom: 2px;
        }

        .stat-value {
          font-weight: 600;
          font-size: 16px;
        }

        .empty-state {
          text-align: center;
          padding: 3rem;
          color: var(--text-secondary, #666);
        }

        @media (max-width: 768px) {
          .client-item {
            grid-template-columns: 1fr;
            gap: 1rem;
          }

          .client-briefs {
            order: -1;
          }

          .client-ring {
            display: none;
          }
        }
      `}</style>

      {showModal && (
        <div
          className="modal-overlay"
          style={{ display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="modal-card">
            <h3 className="modal-title">Новый клиент</h3>
            <form onSubmit={handleCreate}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="client_name">Название компании</label>
                <input
                  id="client_name"
                  type="text"
                  className="form-input"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  required
                  autoFocus
                  placeholder="ООО «Пример»"
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
