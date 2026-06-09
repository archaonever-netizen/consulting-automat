import { useEffect, useState } from 'react';
import api from '../services/api';

interface FunctionItem {
  id: number;
  name: string;
  initials: string;
  color: string;
  description: string | null;
  health: number;
  health_label: string;
  health_cls: string;
}

interface DepartmentItem {
  id: number;
  name: string;
  initials: string;
  color: string;
}

interface LinkItem {
  relation_type: 'executor' | 'consumer' | 'supplier';
  description: string | null;
}

interface CompanyData {
  functions: FunctionItem[];
  departments: DepartmentItem[];
  matrix: Record<string, LinkItem[]>;
  total_functions: number;
  total_departments: number;
  total_links: number;
}

const RELATION_ICON: Record<string, string> = {
  executor: '✓',
  consumer: '▼',
  supplier: '▲',
};

export default function CompanyPage() {
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');

  useEffect(() => {
    api.get('/api/company')
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/company/departments', { name: newDeptName, description: newDeptDesc || null });
      const r = await api.get('/api/company');
      setData(r.data);
      setShowModal(false);
      setNewDeptName('');
      setNewDeptDesc('');
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка создания отдела');
    }
  }

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title">Компания</h1>
        <p className="page-subtitle">Организационная структура: матрица функций и отделов</p>
      </div>

      {data && (
        <>
          <div className="stats-strip">
            <div className="stat">
              <span className="k">Функции</span>
              <span className="v">{data.total_functions}</span>
            </div>
            <div className="stat">
              <span className="k">Отделы</span>
              <span className="v">{data.total_departments}</span>
            </div>
            <div className="stat">
              <span className="k">Связи</span>
              <span className="v">{data.total_links}</span>
            </div>
          </div>

          {data.functions.length > 0 ? (
            <>
              <div className="matrix-wrap">
                <table className="matrix-table">
                  <thead>
                    <tr>
                      <th style={{ width: 200 }}></th>
                      {data.departments.map(dept => (
                        <th key={dept.id} style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <div className="big-av av-md" style={{ background: dept.color, width: 36, height: 36, fontSize: 12, flexShrink: 0 }}>
                              {dept.initials}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'normal' }}>{dept.name}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.functions.map(func => (
                      <tr key={func.id}>
                        <th>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="big-av av-md" style={{ background: func.color, flexShrink: 0 }}>
                              {func.initials}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {func.name}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {func.description || <em>нет описания</em>}
                              </div>
                            </div>
                          </div>
                        </th>
                        {data.departments.map(dept => {
                          const key = `${func.id}_${dept.id}`;
                          const links = data.matrix[key] || [];
                          return (
                            <td key={dept.id} className="matrix-cell">
                              {links.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                  {links.map((link, i) => (
                                    <div
                                      key={i}
                                      className={`matrix-badge ${link.relation_type}`}
                                      title={link.description || link.relation_type}
                                    >
                                      {RELATION_ICON[link.relation_type] || '·'}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: '2rem' }}>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                  Добавить отдел
                </button>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
              <p>Функции не загружены</p>
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className="modal-card">
            <h3 className="modal-title">Новый отдел</h3>
            <form onSubmit={addDepartment}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label" htmlFor="dept_name">Название отдела</label>
                <input
                  id="dept_name"
                  type="text"
                  className="form-input"
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="dept_description">Описание (опционально)</label>
                <textarea
                  id="dept_description"
                  className="form-input"
                  rows={3}
                  value={newDeptDesc}
                  onChange={e => setNewDeptDesc(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn btn-primary">Создать отдел</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
