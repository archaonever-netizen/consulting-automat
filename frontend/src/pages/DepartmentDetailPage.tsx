import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';
import ContentListEditor, { type ContentItem } from '../components/ContentListEditor';

interface LinkRow {
  id: number;
  function_id: number;
  function_name: string;
  description: string | null;
}

interface DepartmentDetail {
  id: number;
  name: string;
  description: string | null;
  ai_employees: ContentItem[];
  employees: ContentItem[];
  regulations: ContentItem[];
  instructions: ContentItem[];
  frameworks: ContentItem[];
  health: number;
  health_label: string;
  health_cls: string;
  executes: LinkRow[];
  consumes: LinkRow[];
  supplies: LinkRow[];
}

interface FuncOption { id: number; name: string; }

type Tab = 'description' | 'content' | 'executes' | 'consumes' | 'supplies';
type Relation = 'executor' | 'consumer' | 'supplier';

const RELATION_TITLE: Record<Relation, string> = {
  executor: 'Назначить исполняемую функцию',
  consumer: 'Потребить функцию',
  supplier: 'Поставить в функцию',
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

export default function DepartmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DepartmentDetail | null>(null);
  const [functions, setFunctions] = useState<FuncOption[]>([]);
  const [tab, setTab] = useState<Tab>('description');
  const [loading, setLoading] = useState(true);

  const [description, setDescription] = useState('');
  const [aiEmployees, setAiEmployees] = useState<ContentItem[]>([]);
  const [employees, setEmployees] = useState<ContentItem[]>([]);
  const [regulations, setRegulations] = useState<ContentItem[]>([]);
  const [instructions, setInstructions] = useState<ContentItem[]>([]);
  const [frameworks, setFrameworks] = useState<ContentItem[]>([]);

  const [modalRelation, setModalRelation] = useState<Relation | null>(null);
  const [modalFunc, setModalFunc] = useState('');
  const [modalDesc, setModalDesc] = useState('');

  function apply(d: DepartmentDetail) {
    setData(d);
    setDescription(d.description ?? '');
    setAiEmployees(d.ai_employees ?? []);
    setEmployees(d.employees ?? []);
    setRegulations(d.regulations ?? []);
    setInstructions(d.instructions ?? []);
    setFrameworks(d.frameworks ?? []);
  }

  async function load() {
    const [dp, company] = await Promise.all([
      api.get<DepartmentDetail>(`/api/company/departments/${id}`),
      api.get<{ functions: FuncOption[] }>('/api/company'),
    ]);
    apply(dp.data);
    setFunctions(company.data.functions);
  }

  useEffect(() => {
    setLoading(true);
    load().catch(console.error).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function saveDescription() {
    const { data: d } = await api.patch<DepartmentDetail>(`/api/company/departments/${id}`, { description });
    apply(d);
  }

  async function saveContent() {
    const { data: d } = await api.patch<DepartmentDetail>(`/api/company/departments/${id}`, {
      ai_employees: aiEmployees, employees, regulations, instructions, frameworks,
    });
    apply(d);
    alert('Сохранено');
  }

  async function addLink() {
    if (!modalRelation || !modalFunc) return;
    try {
      await api.post('/api/company/links', {
        function_id: Number(modalFunc),
        department_id: Number(id),
        relation_type: modalRelation,
        description: modalDesc || null,
      });
      setModalRelation(null);
      setModalFunc('');
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
            <span><b>Исполняет:</b> {data.executes.length}</span>
            <span><b>Потребляет:</b> {data.consumes.length}</span>
            <span><b>Поставляет:</b> {data.supplies.length}</span>
          </div>
        </div>
        <HealthRing value={data.health} cls={data.health_cls} label={data.health_label} />
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab${tab === 'description' ? ' active' : ''}`} onClick={() => setTab('description')}>Описание</button>
        <button className={`tab${tab === 'content' ? ' active' : ''}`} onClick={() => setTab('content')}>Содержимое</button>
        <button className={`tab${tab === 'executes' ? ' active' : ''}`} onClick={() => setTab('executes')}>Исполняет</button>
        <button className={`tab${tab === 'consumes' ? ' active' : ''}`} onClick={() => setTab('consumes')}>Потребляет</button>
        <button className={`tab${tab === 'supplies' ? ' active' : ''}`} onClick={() => setTab('supplies')}>Поставляет</button>
      </div>

      {tab === 'description' && (
        <div className="section-card">
          <div className="sc-head"><div className="sc-title">Описание отдела</div></div>
          <textarea className="form-input" rows={5} value={description}
            onChange={e => setDescription(e.target.value)} style={{ resize: 'vertical' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-primary" onClick={saveDescription}>Сохранить описание</button>
          </div>
        </div>
      )}

      {tab === 'content' && (
        <>
          <ContentListEditor label="ИИ сотрудники" hint="Агенты отдела (роль, модель)" items={aiEmployees} onChange={setAiEmployees} />
          <ContentListEditor label="Сотрудники" hint="Люди в отделе" items={employees} onChange={setEmployees} />
          <ContentListEditor label="Регламенты" hint="Правила и процессы отдела" items={regulations} onChange={setRegulations} />
          <ContentListEditor label="Инструкции" hint="Пошаговые инструкции" items={instructions} onChange={setInstructions} />
          <ContentListEditor label="Фреймворки" hint="Методики отдела" items={frameworks} onChange={setFrameworks} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={saveContent}>Сохранить содержимое</button>
          </div>
        </>
      )}

      {tab === 'executes' && (
        <LinkPanel
          title="Функции, которые исполняет отдел"
          subtitle="Основная ответственность отдела"
          links={data.executes}
          emptyText="Функции не назначены"
          addLabel="Назначить функцию"
          onAdd={() => setModalRelation('executor')}
          onRemove={removeLink}
          linkHref={l => `/company/functions/${l.function_id}`}
          linkName={l => l.function_name}
        />
      )}
      {tab === 'consumes' && (
        <LinkPanel
          title="Функции, которые потребляет отдел"
          subtitle="Функции других отделов, используемые в своих процессах"
          links={data.consumes}
          emptyText="Потребляемых функций нет"
          addLabel="Потребить функцию"
          onAdd={() => setModalRelation('consumer')}
          onRemove={removeLink}
          linkHref={l => `/company/functions/${l.function_id}`}
          linkName={l => l.function_name}
        />
      )}
      {tab === 'supplies' && (
        <LinkPanel
          title="Функции, в которые поставляет отдел"
          subtitle="Функции, в выполнение которых вносит вклад"
          links={data.supplies}
          emptyText="Поставок пока нет"
          addLabel="Поставить в функцию"
          onAdd={() => setModalRelation('supplier')}
          onRemove={removeLink}
          linkHref={l => `/company/functions/${l.function_id}`}
          linkName={l => l.function_name}
        />
      )}

      {modalRelation && (
        <div className="modal-overlay" style={{ display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) setModalRelation(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">{RELATION_TITLE[modalRelation]}</h3>
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label className="form-label">Функция</label>
              <select className="form-input" value={modalFunc} onChange={e => setModalFunc(e.target.value)} autoFocus>
                <option value="">Выберите функцию...</option>
                {functions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Описание интеграции (опционально)</label>
              <textarea className="form-input" rows={2} value={modalDesc}
                onChange={e => setModalDesc(e.target.value)} placeholder="Например: поставляем данные для расчётов" />
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setModalRelation(null)}>Отмена</button>
              <button className="btn btn-primary" onClick={addLink} disabled={!modalFunc}>Добавить связь</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
