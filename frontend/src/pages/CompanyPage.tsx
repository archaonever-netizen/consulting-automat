import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

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

type Relation = 'executor' | 'consumer' | 'supplier';

interface LinkItem {
  id: number;
  function_id: number;
  department_id: number;
  relation_type: Relation;
  description: string | null;
}

const RELATION_LABEL: Record<Relation, string> = {
  executor: 'Исполнитель',
  consumer: 'Потребитель',
  supplier: 'Поставщик',
};

interface CompanyData {
  functions: FunctionItem[];
  departments: DepartmentItem[];
  matrix: Record<string, LinkItem[]>;
  total_functions: number;
  total_departments: number;
  total_links: number;
}

// Маленькие line-иконки для бейджей матрицы (executor / consumer / supplier).
const RELATION_PATH: Record<string, string> = {
  executor: 'M5 12.5l4 4 10-11',          // галочка — исполняет
  consumer: 'M12 5v13M6 12l6 6 6-6',      // стрелка вниз — потребляет
  supplier: 'M12 19V6M6 12l6-6 6 6',      // стрелка вверх — поставляет
};

function RelationIcon({ type }: { type: string }) {
  const d = RELATION_PATH[type];
  if (!d) return <span>·</span>;
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export default function CompanyPage() {
  const queryClient = useQueryClient();
  const { data, isLoading: loading } = useQuery<CompanyData>({
    queryKey: ['company'],
    queryFn: async () => (await api.get('/api/company')).data,
  });
  const [showModal, setShowModal] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptDesc, setNewDeptDesc] = useState('');
  // ключ ячейки "funcId_deptId", у которой открыт пикер ролей
  const [activeCell, setActiveCell] = useState<string | null>(null);

  // После мутаций (отделы, связи) сбрасываем кэш компании
  async function reload() {
    await queryClient.invalidateQueries({ queryKey: ['company'] });
  }

  async function addRelation(functionId: number, departmentId: number, relation: Relation) {
    try {
      await api.post('/api/company/links', {
        function_id: functionId,
        department_id: departmentId,
        relation_type: relation,
        description: null,
      });
      setActiveCell(null);
      await reload();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка создания связи');
    }
  }

  async function removeRelation(linkId: number) {
    await api.delete(`/api/company/links/${linkId}`);
    await reload();
  }

  async function addDepartment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post('/api/company/departments', { name: newDeptName, description: newDeptDesc || null });
      await reload();
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
        <p className="page-subtitle">Организационная структура: матрица функций и отделов. Клик по ячейке — назначить роль (исполнитель/потребитель/поставщик); по названию функции или отдела — открыть карточку.</p>
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
                          <Link to={`/company/departments/${dept.id}`}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'inherit' }}>
                            <div className="big-av av-md" style={{ background: dept.color, width: 36, height: 36, fontSize: 12, flexShrink: 0 }}>
                              {dept.initials}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'normal' }}>{dept.name}</span>
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.functions.map(func => (
                      <tr key={func.id}>
                        <th>
                          <Link to={`/company/functions/${func.id}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
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
                          </Link>
                        </th>
                        {data.departments.map(dept => {
                          const key = `${func.id}_${dept.id}`;
                          const links = data.matrix[key] || [];
                          const isActive = activeCell === key;
                          const existing = new Set(links.map(l => l.relation_type));
                          return (
                            <td key={dept.id} className="matrix-cell" style={{ position: 'relative' }}
                              onClick={() => setActiveCell(isActive ? null : key)}>
                              {links.length > 0 && (
                                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                                  {links.map(link => (
                                    <div
                                      key={link.id}
                                      className={`matrix-badge ${link.relation_type}`}
                                      title={`${RELATION_LABEL[link.relation_type]} — клик в меню, чтобы удалить`}
                                    >
                                      <RelationIcon type={link.relation_type} />
                                    </div>
                                  ))}
                                </div>
                              )}
                              {isActive && (
                                <div
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    position: 'absolute', zIndex: 20, top: '100%', left: '50%', transform: 'translateX(-50%)',
                                    marginTop: 4, background: 'var(--surface)', border: '1px solid var(--line)',
                                    borderRadius: 10, boxShadow: 'var(--sh-md, 0 8px 24px rgba(0,0,0,.12))',
                                    padding: 8, minWidth: 170, textAlign: 'left',
                                  }}>
                                  {(['executor', 'consumer', 'supplier'] as Relation[]).map(rel => {
                                    const linked = links.find(l => l.relation_type === rel);
                                    return (
                                      <div key={rel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 2px' }}>
                                        <span style={{ fontSize: 13, fontWeight: 600 }}>{RELATION_LABEL[rel]}</span>
                                        {linked ? (
                                          <button className="btn btn-danger btn-sm"
                                            onClick={() => removeRelation(linked.id)} title="Удалить">
                                            <Icon name="trash" size={13} />
                                          </button>
                                        ) : (
                                          <button className="btn btn-soft btn-sm"
                                            onClick={() => addRelation(func.id, dept.id, rel)} title="Назначить"
                                            disabled={rel === 'executor' && existing.has('executor')}>
                                            <Icon name="plus" size={13} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
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
                  <Icon name="plus" size={17} />Добавить отдел
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
