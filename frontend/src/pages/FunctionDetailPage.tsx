import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import ContentListEditor, { type ContentItem } from '../components/ContentListEditor';

interface LinkRow {
  id: number;
  department_id: number;
  department_name: string;
  description: string | null;
}

interface FunctionDetail {
  id: number;
  name: string;
  description: string | null;
  frameworks: ContentItem[];
  skills: ContentItem[];
  features: ContentItem[];
  databases: ContentItem[];
  product: string | null;
  health: number;
  health_label: string;
  health_cls: string;
  executor: LinkRow | null;
  consumers: LinkRow[];
  suppliers: LinkRow[];
}

interface DeptOption { id: number; name: string; }

type Tab = 'description' | 'content' | 'executor' | 'consumers' | 'suppliers';
type Relation = 'executor' | 'consumer' | 'supplier';

const RELATION_TITLE: Record<Relation, string> = {
  executor: 'Назначить исполнителя',
  consumer: 'Добавить потребителя',
  supplier: 'Добавить поставщика',
};

function HealthRing({ value, cls, label }: { value: number; cls: string; label: string }) {
  const filled = (value / 100) * 113;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg className="health-ring" width="72" height="72" viewBox="0 0 50 50">
        <circle className="track" cx="25" cy="25" r="18" />
        <circle className={`fill ${cls}`} cx="25" cy="25" r="18"
          strokeDasharray={`${filled} ${113 - filled}`} strokeDashoffset="0" />
        <text x="25" y="26">{value}%</text>
      </svg>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default function FunctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<FunctionDetail | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [tab, setTab] = useState<Tab>('description');
  const [loading, setLoading] = useState(true);

  // редактируемые состояния
  const [description, setDescription] = useState('');
  const [product, setProduct] = useState('');
  const [frameworks, setFrameworks] = useState<ContentItem[]>([]);
  const [skills, setSkills] = useState<ContentItem[]>([]);
  const [features, setFeatures] = useState<ContentItem[]>([]);
  const [databases, setDatabases] = useState<ContentItem[]>([]);

  // модалка добавления связи
  const [modalRelation, setModalRelation] = useState<Relation | null>(null);
  const [modalDept, setModalDept] = useState('');
  const [modalDesc, setModalDesc] = useState('');

  function apply(d: FunctionDetail) {
    setData(d);
    setDescription(d.description ?? '');
    setProduct(d.product ?? '');
    setFrameworks(d.frameworks ?? []);
    setSkills(d.skills ?? []);
    setFeatures(d.features ?? []);
    setDatabases(d.databases ?? []);
  }

  async function load() {
    const [fn, company] = await Promise.all([
      api.get<FunctionDetail>(`/api/company/functions/${id}`),
      api.get<{ departments: DeptOption[] }>('/api/company'),
    ]);
    apply(fn.data);
    setDepartments(company.data.departments);
  }

  useEffect(() => {
    setLoading(true);
    load().catch(console.error).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveDescription() {
    const { data: d } = await api.patch<FunctionDetail>(`/api/company/functions/${id}`, { description });
    apply(d);
  }

  async function saveContent() {
    const { data: d } = await api.patch<FunctionDetail>(`/api/company/functions/${id}`, {
      frameworks, skills, features, databases, product,
    });
    apply(d);
    alert('Сохранено');
  }

  async function addLink() {
    if (!modalRelation || !modalDept) return;
    try {
      await api.post('/api/company/links', {
        function_id: Number(id),
        department_id: Number(modalDept),
        relation_type: modalRelation,
        description: modalDesc || null,
      });
      setModalRelation(null);
      setModalDept('');
      setModalDesc('');
      await load();
    } catch (e: any) {
      alert(e.response?.data?.detail || 'Ошибка создания связи');
    }
  }

  async function removeLink(linkId: number) {
    if (!confirm('Удалить связь?')) return;
    await api.delete(`/api/company/links/${linkId}`);
    await load();
  }

  if (loading || !data) return <div className="page"><div className="loading-bar" /></div>;

  return (
    <div className="page">
      <Link to="/company" className="back-link">
        <Icon name="arrowLeft" size={18} />Компания
      </Link>

      <div className="client-hero">
        <div style={{ flex: 1 }}>
          <h1 className="page-title">{data.name}</h1>
          {data.description && <p className="page-subtitle">{data.description}</p>}
          <div style={{ display: 'flex', gap: 20, marginTop: 10, fontSize: 14, color: 'var(--text-secondary)' }}>
            <span><b>Исполнитель:</b> {data.executor?.department_name ?? '—'}</span>
            <span><b>Потребители:</b> {data.consumers.length}</span>
            <span><b>Поставщики:</b> {data.suppliers.length}</span>
          </div>
        </div>
        <HealthRing value={data.health} cls={data.health_cls} label={data.health_label} />
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${tab === 'description' ? ' active' : ''}`} onClick={() => setTab('description')}>Описание</button>
        <button className={`tab${tab === 'content' ? ' active' : ''}`} onClick={() => setTab('content')}>Содержимое</button>
        <button className={`tab${tab === 'executor' ? ' active' : ''}`} onClick={() => setTab('executor')}>Исполнитель</button>
        <button className={`tab${tab === 'consumers' ? ' active' : ''}`} onClick={() => setTab('consumers')}>Потребители</button>
        <button className={`tab${tab === 'suppliers' ? ' active' : ''}`} onClick={() => setTab('suppliers')}>Поставщики</button>
      </div>

      {tab === 'description' && (
        <div className="section-card">
          <div className="sc-head"><div className="sc-title">Описание функции</div></div>
          <textarea className="form-input" rows={5} value={description}
            onChange={e => setDescription(e.target.value)} style={{ resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={saveDescription}>Сохранить описание</button>
          </div>
        </div>
      )}

      {tab === 'content' && (
        <>
          <ContentListEditor label="Фреймворки" hint="Методики, которые применяет агент функции" items={frameworks} onChange={setFrameworks} />
          <ContentListEditor label="Скилы" hint="Навыки/компетенции функции" items={skills} onChange={setSkills} />
          <ContentListEditor label="Фичи" hint="Конкретные возможности функции" items={features} onChange={setFeatures} />
          <ContentListEditor label="Базы данных" hint="Источники знаний для агента" items={databases} onChange={setDatabases} />
          <div className="section-card" style={{ marginBottom: 16 }}>
            <div className="sc-head"><div className="sc-title">Продукт функции</div></div>
            <textarea className="form-input" rows={3} value={product}
              onChange={e => setProduct(e.target.value)} placeholder="Что функция отдаёт на выходе"
              style={{ resize: 'vertical' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveContent}>Сохранить содержимое</button>
          </div>
        </>
      )}

      {tab === 'executor' && (
        <LinkPanel
          title="Исполнитель функции"
          subtitle="Отдел, который отвечает за выполнение этой функции"
          links={data.executor ? [data.executor] : []}
          emptyText="Исполнитель не назначен"
          addLabel="Назначить исполнителя"
          onAdd={() => setModalRelation('executor')}
          onRemove={removeLink}
          linkHref={l => `/company/departments/${l.department_id}`}
          linkName={l => l.department_name}
        />
      )}
      {tab === 'consumers' && (
        <LinkPanel
          title="Потребители функции"
          subtitle="Отделы, которые используют продукт этой функции"
          links={data.consumers}
          emptyText="Потребителей пока нет"
          addLabel="Добавить потребителя"
          onAdd={() => setModalRelation('consumer')}
          onRemove={removeLink}
          linkHref={l => `/company/departments/${l.department_id}`}
          linkName={l => l.department_name}
        />
      )}
      {tab === 'suppliers' && (
        <LinkPanel
          title="Поставщики для функции"
          subtitle="Отделы, которые поставляют вклад в эту функцию"
          links={data.suppliers}
          emptyText="Поставщиков пока нет"
          addLabel="Добавить поставщика"
          onAdd={() => setModalRelation('supplier')}
          onRemove={removeLink}
          linkHref={l => `/company/departments/${l.department_id}`}
          linkName={l => l.department_name}
        />
      )}

      {modalRelation && (
        <div className="modal-overlay" style={{ display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) setModalRelation(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">{RELATION_TITLE[modalRelation]}</h3>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Отдел</label>
              <select className="form-input" value={modalDept} onChange={e => setModalDept(e.target.value)} autoFocus>
                <option value="">Выберите отдел...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Описание процесса (опционально)</label>
              <textarea className="form-input" rows={2} value={modalDesc}
                onChange={e => setModalDesc(e.target.value)} placeholder="Например: использует данные для расчётов" />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalRelation(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={addLink} disabled={!modalDept}>Добавить связь</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Переиспользуемая панель списка связей (исполнитель/потребители/поставщики).
function LinkPanel<T extends { id: number }>({
  title, subtitle, links, emptyText, addLabel, onAdd, onRemove, linkHref, linkName,
}: {
  title: string; subtitle: string; links: T[]; emptyText: string; addLabel: string;
  onAdd: () => void; onRemove: (id: number) => void;
  linkHref: (l: T) => string; linkName: (l: T) => string;
}) {
  return (
    <div className="section-card">
      <div className="sc-head">
        <div>
          <div className="sc-title">{title}</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{subtitle}</p>
        </div>
      </div>
      {links.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-secondary)' }}>{emptyText}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {links.map(l => (
            <div key={l.id} style={{ padding: 14, background: 'var(--surface-2)', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <Link to={linkHref(l)} style={{ fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
                {linkName(l)}
              </Link>
              <button className="btn btn-danger btn-sm" onClick={() => onRemove(l.id)}>Удалить</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <button className="btn btn-soft" onClick={onAdd}><Icon name="plus" size={16} />{addLabel}</button>
      </div>
    </div>
  );
}
