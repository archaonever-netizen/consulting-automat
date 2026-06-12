import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

interface ClientListItem {
  id: number;
  name: string;
  initials: string;
  color: string;
  health: number;
  health_label: string;
  health_cls: string; // up | warn | down | flat
  ring_filled: number;
  ring_empty: number;
  done: number;
  total: number;
  bd_briefing: string; // done | work | none
  bd_point_a: string;
  bd_docs: string;
}

const RING_STROKE: Record<string, string> = {
  up: '#1F9D57', warn: '#C2820F', down: '#E23D32', flat: '#BFC0C7',
};
const PILL_CLS: Record<string, string> = {
  up: 'pill-green', warn: 'pill-amber', down: 'pill-red', flat: 'pill-gray',
};

function HealthRing({ c, size }: { c: ClientListItem; size: number }) {
  return (
    <svg viewBox="0 0 42 42" width={size} height={size} style={{ transform: 'rotate(-90deg)', flex: '0 0 auto' }}>
      <circle cx="21" cy="21" r="18" fill="none" stroke="var(--border-2)" strokeWidth="3" />
      <circle
        cx="21" cy="21" r="18" fill="none"
        stroke={RING_STROKE[c.health_cls] || RING_STROKE.flat}
        strokeWidth="3"
        strokeDasharray={`${c.ring_filled} ${c.ring_empty}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

function BriefDots({ c }: { c: ClientListItem }) {
  return (
    <span className="brief-dots" title="Брифинг · Точка А · Документы">
      <span className={'bd ' + c.bd_briefing} />
      <span className={'bd ' + c.bd_point_a} />
      <span className={'bd ' + c.bd_docs} />
    </span>
  );
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading: loading } = useQuery<ClientListItem[]>({
    queryKey: ['clients'],
    queryFn: async () => (await api.get('/api/clients')).data,
  });
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'new'>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [modal, setModal] = useState<null | { mode: 'add' | 'edit'; client?: ClientListItem }>(null);
  const [confirm, setConfirm] = useState<ClientListItem | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [busy, setBusy] = useState(false);

  // После мутаций сбрасываем кэш списка клиентов (включая карточки) и сводку главной
  async function reload() {
    await queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['home'] });
  }

  function openAdd() { setNameInput(''); setModal({ mode: 'add' }); }
  function openEdit(c: ClientListItem) { setNameInput(c.name); setModal({ mode: 'edit', client: c }); }

  async function saveClient(e: React.FormEvent) {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setBusy(true);
    try {
      if (modal?.mode === 'edit' && modal.client) {
        await api.put(`/api/clients/${modal.client.id}`, { name: nameInput.trim() });
      } else {
        await api.post('/api/clients', { name: nameInput.trim() });
      }
      await reload();
      setModal(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.delete(`/api/clients/${confirm.id}`);
      await reload();
      setConfirm(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = clients.filter(c => {
    const matchQ = !q || c.name.toLowerCase().includes(q);
    const matchF = filter === 'all'
      || (filter === 'active' && c.health > 0)
      || (filter === 'new' && c.health === 0);
    return matchQ && matchF;
  });

  const total = clients.length;
  const active = clients.filter(c => c.health > 0).length;
  const briefsDone = clients.reduce((a, c) => a + c.done, 0);
  const briefsTotal = clients.reduce((a, c) => a + c.total, 0);
  const healthy = clients.filter(c => c.health > 0);
  const avgHealth = healthy.length ? Math.round(healthy.reduce((a, c) => a + c.health, 0) / healthy.length) : 0;

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-head rise">
        <div>
          <h1>Клиенты</h1>
          <p>Картотека бизнесов под управлением. ИИ отслеживает состояние и подсказывает следующий шаг.</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={openAdd}><Icon name="plus" size={17} />Добавить клиента</button>
        </div>
      </div>

      <div className="stats-strip rise d1">
        <div className="stat"><div className="k"><Icon name="users" size={15} />Всего клиентов</div><div className="v">{total}</div></div>
        <div className="stat"><div className="k"><Icon name="bolt" size={15} />Активные</div><div className="v">{active}</div><div className="d flat">{total ? Math.round(active / total * 100) : 0}% базы</div></div>
        <div className="stat"><div className="k"><Icon name="check" size={15} />Брифы заполнены</div><div className="v">{briefsDone}<small> / {briefsTotal}</small></div><div className="d up">{briefsTotal ? Math.round(briefsDone / briefsTotal * 100) : 0}% готовности</div></div>
        <div className="stat"><div className="k"><Icon name="trendUp" size={15} />Средний health</div><div className="v">{avgHealth || '—'}</div></div>
      </div>

      <div className="toolbar rise d2">
        <div className="search">
          <Icon name="search" size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию…" />
        </div>
        <div className="seg">
          {([['all', 'Все'], ['active', 'Активные'], ['new', 'Новые']] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="view-toggle">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setView('grid')} title="Сетка"><Icon name="grid" size={16} /></button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')} title="Список"><Icon name="list" size={16} /></button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-tab">
          <div className="ei"><Icon name="users" size={24} /></div>
          <b>{clients.length === 0 ? 'Пока нет клиентов' : 'Ничего не найдено'}</b>
          <span>{clients.length === 0 ? 'Добавьте первый бизнес в картотеку — ИИ подготовит брифы.' : 'Измените запрос или фильтр.'}</span>
        </div>
      )}

      {view === 'grid' && filtered.length > 0 && (
        <div className="clients-grid">
          {filtered.map((c, i) => (
            <div key={c.id} className={'client-card rise d' + Math.min(i + 1, 6)} onClick={() => navigate(`/clients/${c.id}`)}>
              <div className="cc-top">
                <span className="big-av av-md" style={{ background: c.color }}>{c.initials}</span>
                <div className="cc-id" style={{ flex: 1, minWidth: 0 }}>
                  <div className="cc-name">
                    <span>{c.name}</span>
                    <span className={'pill ' + (PILL_CLS[c.health_cls] || 'pill-gray')}>{c.health_label}</span>
                  </div>
                  <div className="cc-meta">{c.done}/{c.total} брифов заполнено</div>
                </div>
                <div className="cc-actions" onClick={e => e.stopPropagation()}>
                  <button title="Открыть" onClick={() => navigate(`/clients/${c.id}`)}><Icon name="arrowRight" size={15} /></button>
                  <button title="Переименовать" onClick={() => openEdit(c)}><Icon name="edit" size={15} /></button>
                  <button className="del" title="Удалить" onClick={() => setConfirm(c)}><Icon name="trash" size={15} /></button>
                </div>
              </div>

              <div className="cc-health">
                <HealthRing c={c} size={50} />
                <div className="health-info">
                  <b>{c.health_label}</b>
                  <span>{c.health > 0 ? `health ${c.health}%` : 'нужен брифинг'}</span>
                </div>
              </div>

              <div className="cc-foot">
                <span>Заполнено: {c.done}/{c.total}</span>
                <BriefDots c={c} />
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && filtered.length > 0 && (
        <div className="clients-table">
          <div className="ct-row head">
            <span>Клиент</span><span>Health</span><span>Брифы</span><span>Готово</span>
          </div>
          {filtered.map(c => (
            <div key={c.id} className="ct-row" onClick={() => navigate(`/clients/${c.id}`)}>
              <div className="ct-client" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span className="big-av av-sm" style={{ background: c.color }}>{c.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</b>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{c.health_label}</span>
                </div>
              </div>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><HealthRing c={c} size={38} /></span>
              <BriefDots c={c} />
              <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 700 }}>{c.done}/{c.total}</span>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">{modal.mode === 'edit' ? 'Переименовать клиента' : 'Новый клиент'}</h3>
            <form onSubmit={saveClient}>
              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" htmlFor="client_name">Название компании</label>
                <input id="client_name" type="text" className="form-input" value={nameInput}
                  onChange={e => setNameInput(e.target.value)} required autoFocus placeholder="ООО «Пример»" />
              </div>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Сохранение…' : modal.mode === 'edit' ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">Удалить клиента?</h3>
            <p className="modal-text">Клиент «{confirm.name}» и все его данные будут удалены без возможности восстановления.</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Отмена</button>
              <button type="button" className="btn btn-primary" style={{ background: 'var(--danger)', boxShadow: 'none' }} disabled={busy} onClick={doDelete}>
                {busy ? 'Удаление…' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
