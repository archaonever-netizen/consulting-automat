import { useState, useEffect, useCallback, Fragment } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icon';

interface Space { id: number; title: string; }
interface Board { id: number; title: string; }
interface Column { id: number; title: string; sort_order?: number; type?: number; }
interface Lane { id: number; title: string; sort_order?: number; }
interface Member { id: number; full_name?: string; username?: string; email?: string; initials?: string; }
interface KUser { id: number; full_name?: string; username?: string; email?: string; initials?: string; }
interface AppUser { id: number; email: string; full_name: string; is_founder: boolean; role_name?: string | null; }

// Резолв исполнителя: если email Kaiten-профиля совпал с сотрудником ШЕФ — показываем ШЕФ.
interface ResolvedMember { name: string; initials: string; sub: string; shef: boolean; }
function resolveMember(m: { full_name?: string; username?: string; email?: string; initials?: string }, shefByEmail: Map<string, AppUser>): ResolvedMember {
  const su = m.email ? shefByEmail.get(m.email.toLowerCase()) : undefined;
  if (su) return { name: su.full_name, initials: initialsOf({ full_name: su.full_name }), sub: su.role_name || (su.is_founder ? 'Основатель' : 'Сотрудник'), shef: true };
  return { name: m.full_name || m.username || '?', initials: initialsOf(m), sub: 'Kaiten', shef: false };
}
interface Card {
  id: number;
  title: string;
  column_id: number;
  lane_id?: number;
  description?: string;
  due_date?: string | null;
  sort_order?: number;
  members?: Member[];
}

// ── helpers ──
function initialsOf(m: { initials?: string; full_name?: string; username?: string }): string {
  if (m.initials) return m.initials.slice(0, 2).toUpperCase();
  const name = m.full_name || m.username || '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function toDateInput(iso?: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}
function dueBadge(iso?: string | null): { text: string; overdue: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return { text: d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }), overdue: d.getTime() < today.getTime() };
}
const COL_DOT: Record<number, string> = { 1: '#94a3b8', 2: '#2563EB', 3: '#16a34a' };

export default function TrackerPage() {
  const [connected, setConnected] = useState<boolean | null>(null);

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState<number | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);

  const [columns, setColumns] = useState<Column[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [users, setUsers] = useState<KUser[]>([]);
  const [appUsers, setAppUsers] = useState<AppUser[]>([]);
  const [loadingBoard, setLoadingBoard] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dragId, setDragId] = useState<number | null>(null);
  const [addingCell, setAddingCell] = useState<string | null>(null); // `${laneId}:${colId}`
  const [newTitle, setNewTitle] = useState('');

  const [selectedId, setSelectedId] = useState<number | null>(null);

  // 1. Подключение + пространства + пользователи
  useEffect(() => {
    api.get('/api/kaiten/connection')
      .then(r => {
        setConnected(r.data.connected);
        if (r.data.connected) {
          api.get('/api/kaiten/users').then(u => setUsers(u.data || [])).catch(() => {});
          api.get('/api/users').then(u => setAppUsers(u.data || [])).catch(() => {});
          return api.get('/api/kaiten/spaces');
        }
      })
      .then(r => { if (r) setSpaces(r.data || []); })
      .catch(() => setConnected(false));
  }, []);

  // 2. Доски пространства
  useEffect(() => {
    if (spaceId == null) { setBoards([]); setBoardId(null); return; }
    api.get('/api/kaiten/boards', { params: { space_id: spaceId } })
      .then(r => setBoards(r.data || []))
      .catch(e => setError(e?.response?.data?.detail || 'Не удалось загрузить доски'));
  }, [spaceId]);

  // 3. Колонки + дорожки + карточки доски
  const loadBoard = useCallback(async (id: number) => {
    setLoadingBoard(true); setError(null);
    try {
      const [boardRes, cardsRes] = await Promise.all([
        api.get(`/api/kaiten/boards/${id}`),
        api.get(`/api/kaiten/boards/${id}/cards`),
      ]);
      const cols: Column[] = (boardRes.data?.columns || []).slice()
        .sort((a: Column, b: Column) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const lns: Lane[] = (boardRes.data?.lanes || []).slice()
        .sort((a: Lane, b: Lane) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      setColumns(cols);
      setLanes(lns.length ? lns : [{ id: 0, title: '' }]);
      setCards(cardsRes.data || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось загрузить доску');
      setColumns([]); setLanes([]); setCards([]);
    } finally {
      setLoadingBoard(false);
    }
  }, []);

  useEffect(() => { if (boardId != null) loadBoard(boardId); }, [boardId, loadBoard]);

  const multiLane = lanes.length > 1;
  const laneIds = new Set(lanes.map(l => l.id));
  const shefByEmail = new Map(appUsers.map(u => [u.email.toLowerCase(), u]));

  // Карточки ячейки (lane × column). Карточки с неизвестной дорожкой падают в первую.
  function cellCards(laneId: number, colId: number, isFirstLane: boolean): Card[] {
    return cards
      .filter(c => c.column_id === colId &&
        (c.lane_id != null && laneIds.has(c.lane_id) ? c.lane_id === laneId : isFirstLane))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  const columnTotal = (colId: number) => cards.filter(c => c.column_id === colId).length;

  // ── Перемещение (колонка + дорожка + позиция) ──
  async function moveCard(cardId: number, columnId: number, laneId: number, sortOrder: number) {
    const prev = cards;
    setCards(cs => cs.map(c => c.id === cardId ? { ...c, column_id: columnId, lane_id: laneId, sort_order: sortOrder } : c));
    try {
      await api.patch(`/api/kaiten/cards/${cardId}`, { column_id: columnId, lane_id: laneId, sort_order: sortOrder });
    } catch (e: any) {
      setCards(prev);
      setError(e?.response?.data?.detail || 'Не удалось переместить карточку');
    }
  }

  function dropToCellEnd(colId: number, laneId: number, isFirstLane: boolean) {
    if (dragId == null) return;
    const inCell = cellCards(laneId, colId, isFirstLane).filter(c => c.id !== dragId);
    const maxSort = inCell.length ? (inCell[inCell.length - 1].sort_order ?? 0) : 0;
    moveCard(dragId, colId, laneId, maxSort + 1);
    setDragId(null);
  }

  function dropBeforeCard(target: Card, isFirstLane: boolean) {
    if (dragId == null || dragId === target.id) { setDragId(null); return; }
    const laneId = target.lane_id != null && laneIds.has(target.lane_id) ? target.lane_id : lanes[0].id;
    const inCell = cellCards(laneId, target.column_id, isFirstLane).filter(c => c.id !== dragId);
    const idx = inCell.findIndex(c => c.id === target.id);
    const before = idx > 0 ? (inCell[idx - 1].sort_order ?? 0) : (target.sort_order ?? 0) - 1;
    moveCard(dragId, target.column_id, laneId, (before + (target.sort_order ?? 0)) / 2);
    setDragId(null);
  }

  // ── Создание / удаление ──
  async function handleCreate(colId: number, laneId: number) {
    const title = newTitle.trim();
    if (!title || boardId == null) { setAddingCell(null); setNewTitle(''); return; }
    try {
      const payload: any = { board_id: boardId, column_id: colId, title };
      if (laneId) payload.lane_id = laneId;
      const r = await api.post('/api/kaiten/cards', payload);
      setCards(cs => [...cs, r.data]);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось создать карточку');
    } finally {
      setAddingCell(null); setNewTitle('');
    }
  }

  async function handleDelete(card: Card) {
    const prev = cards;
    setCards(cs => cs.filter(c => c.id !== card.id));
    if (selectedId === card.id) setSelectedId(null);
    try {
      await api.delete(`/api/kaiten/cards/${card.id}`);
    } catch (e: any) {
      setCards(prev);
      setError(e?.response?.data?.detail || 'Не удалось удалить карточку');
    }
  }

  function patchLocal(cardId: number, patch: Partial<Card>) {
    setCards(cs => cs.map(c => c.id === cardId ? { ...c, ...patch } : c));
  }
  const selectedCard = cards.find(c => c.id === selectedId) || null;

  // ── Не подключён ──
  if (connected === false) {
    return (
      <div className="page">
        <div className="page-head rise"><div><h1>Трекер</h1><p>Канбан-доска задач на базе Kaiten.</p></div></div>
        <div className="card">
          <div className="empty-tab" style={{ padding: '64px 16px' }}>
            <div className="ei"><Icon name="grid" size={22} /></div>
            <b>Kaiten не подключён</b>
            <span>Подключите своё пространство Kaiten в профиле, чтобы работать с трекером.</span>
            <Link to="/profile" className="btn btn-primary btn-sm" style={{ marginTop: 14 }}><Icon name="gear" size={15} />Перейти в профиль</Link>
          </div>
        </div>
      </div>
    );
  }
  if (connected === null) return <div className="page"><div className="loading-bar"></div></div>;

  // Рендер одной ячейки (lane × column)
  const renderCell = (col: Column, lane: Lane, isFirstLane: boolean) => {
    const cc = cellCards(lane.id, col.id, isFirstLane);
    const cellKey = `${lane.id}:${col.id}`;
    return (
      <div key={cellKey} className="cell" onDragOver={e => e.preventDefault()} onDrop={() => dropToCellEnd(col.id, lane.id, isFirstLane)}>
        {cc.map(card => {
          const due = dueBadge(card.due_date);
          const mem = card.members || [];
          return (
            <div
              key={card.id} className="kanban-card" draggable
              onDragStart={() => setDragId(card.id)}
              onDragEnd={() => setDragId(null)}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.stopPropagation(); dropBeforeCard(card, isFirstLane); }}
              onClick={() => setSelectedId(card.id)}
            >
              <div className="kanban-card-title">{card.title}</div>
              {card.description && <div className="kanban-card-desc">{card.description}</div>}
              {(due || mem.length > 0) && (
                <div className="kanban-card-foot">
                  {due ? <span className={`due-pill${due.overdue ? ' overdue' : ''}`}><Icon name="clock" size={12} />{due.text}</span> : <span />}
                  <span className="card-avatars">
                    {mem.slice(0, 3).map(m => {
                      const rm = resolveMember(m, shefByEmail);
                      return <span key={m.id} className={`avatar-sm${rm.shef ? ' shef' : ''}`} title={`${rm.name}${rm.shef ? ' · ' + rm.sub : ''}`}>{rm.initials}</span>;
                    })}
                    {mem.length > 3 && <span className="avatar-sm more">+{mem.length - 3}</span>}
                  </span>
                </div>
              )}
              <button className="kanban-card-del" title="Удалить" onClick={e => { e.stopPropagation(); handleDelete(card); }}><Icon name="trash" size={13} /></button>
            </div>
          );
        })}

        {addingCell === cellKey ? (
          <div className="kanban-add">
            <input
              autoFocus value={newTitle} placeholder="Название карточки"
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate(col.id, lane.id); if (e.key === 'Escape') { setAddingCell(null); setNewTitle(''); } }}
              onBlur={() => handleCreate(col.id, lane.id)}
            />
          </div>
        ) : (
          <button className="kanban-addbtn" onClick={() => { setAddingCell(cellKey); setNewTitle(''); }}><Icon name="plus" size={14} />Карточка</button>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-head rise">
        <div><h1>Трекер</h1><p>Канбан-доска задач на базе Kaiten.</p></div>
        <div className="head-actions trk-selectors">
          <select value={spaceId ?? ''} onChange={e => { setSpaceId(e.target.value ? Number(e.target.value) : null); setBoardId(null); setColumns([]); setLanes([]); setCards([]); }}>
            <option value="">Пространство…</option>
            {spaces.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
          <select value={boardId ?? ''} onChange={e => setBoardId(e.target.value ? Number(e.target.value) : null)} disabled={!boards.length}>
            <option value="">Доска…</option>
            {boards.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm" disabled={boardId == null || loadingBoard} onClick={() => boardId != null && loadBoard(boardId)} title="Обновить"><Icon name="share" size={15} />Обновить</button>
        </div>
      </div>

      {error && <div className="trk-error">{error}<button onClick={() => setError(null)}><Icon name="close" size={14} /></button></div>}

      {loadingBoard ? (
        <div className="loading-bar"></div>
      ) : boardId == null ? (
        <div className="card">
          <div className="empty-tab" style={{ padding: '64px 16px' }}>
            <div className="ei"><Icon name="grid" size={22} /></div>
            <b>Выберите доску</b><span>Выберите пространство и доску Kaiten вверху справа.</span>
          </div>
        </div>
      ) : columns.length === 0 ? (
        <div className="card"><div className="empty-tab" style={{ padding: '48px 16px' }}><span>На этой доске нет колонок.</span></div></div>
      ) : (
        <div className="board-scroll">
          <div className="board-grid" style={{ gridTemplateColumns: `repeat(${columns.length}, 288px)` }}>
            {/* Заголовки колонок */}
            {columns.map(col => (
              <div key={`h-${col.id}`} className="col-head">
                <span className="kanban-col-title"><span className="col-dot" style={{ background: COL_DOT[col.type ?? 0] || '#cbd5e1' }} />{col.title}</span>
                <span className="kanban-count">{columnTotal(col.id)}</span>
              </div>
            ))}

            {/* Дорожки */}
            {lanes.map((lane, li) => (
              <Fragment key={`lane-${lane.id}`}>
                {multiLane && (
                  <div className="lane-band" style={{ gridColumn: '1 / -1' }}>
                    <Icon name="list" size={14} />{lane.title || 'Без названия'}
                  </div>
                )}
                {columns.map(col => renderCell(col, lane, li === 0))}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {selectedCard && (
        <CardDrawer card={selectedCard} users={users} appUsers={appUsers} onClose={() => setSelectedId(null)} onPatchLocal={patchLocal} onError={setError} onDelete={handleDelete} />
      )}

      <style>{`
        .trk-selectors { display: flex; gap: 10px; align-items: center; }
        .trk-selectors select { padding: 9px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 13.5px; color: var(--text-primary); cursor: pointer; }
        .trk-selectors select:focus { outline: none; border-color: var(--accent); }
        .trk-error { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 8px 0 14px; padding: 10px 14px; border-radius: 9px; background: #fff1f0; color: #c0392b; font-size: 13px; border: 1px solid #ffd6d2; }
        .trk-error button { border: none; background: none; color: inherit; cursor: pointer; display: flex; }

        .board-scroll { overflow-x: auto; padding: 6px 2px 16px; }
        .board-grid { display: grid; gap: 12px; align-items: start; min-width: min-content; }
        .col-head { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: 10px 6px; background: var(--surface); border-bottom: 2px solid var(--line); }
        .kanban-col-title { display: flex; align-items: center; gap: 8px; font-size: 13.5px; font-weight: 700; color: var(--text-primary); }
        .col-dot { width: 8px; height: 8px; border-radius: 999px; flex: 0 0 auto; }
        .kanban-count { font-size: 12px; font-weight: 600; color: var(--ink-4); background: var(--surface-2); border-radius: 20px; padding: 1px 9px; }
        .lane-band { display: flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink-4); padding: 12px 4px 2px; position: sticky; left: 0; }
        .cell { background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; padding: 10px; min-height: 70px; display: flex; flex-direction: column; gap: 9px; }

        .kanban-card { position: relative; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 11px 30px 11px 12px; cursor: pointer; transition: var(--transition); }
        .kanban-card:hover { box-shadow: var(--shadow-1, 0 2px 8px rgba(0,0,0,.06)); border-color: var(--accent); }
        .kanban-card-title { font-size: 13.5px; font-weight: 600; color: var(--text-primary); line-height: 1.4; }
        .kanban-card-desc { font-size: 12px; color: var(--ink-4); margin-top: 5px; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .kanban-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 9px; }
        .due-pill { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 600; color: var(--ink-4); background: var(--surface-2); border-radius: 20px; padding: 2px 8px; }
        .due-pill.overdue { color: #c0392b; background: #fff1f0; }
        .card-avatars { display: flex; }
        .avatar-sm { width: 22px; height: 22px; border-radius: 999px; display: grid; place-items: center; font-size: 10px; font-weight: 700; color: #fff; background: linear-gradient(135deg, #2563EB, #1D4ED8); border: 1.5px solid var(--surface); margin-left: -6px; }
        .avatar-sm:first-child { margin-left: 0; }
        .avatar-sm.more { background: var(--ink-4); }
        .avatar-sm.shef { background: linear-gradient(135deg, #0d9488, #0f766e); }
        .kanban-card-del { position: absolute; top: 8px; right: 8px; border: none; background: none; color: var(--ink-4); cursor: pointer; opacity: 0; transition: var(--transition); display: flex; }
        .kanban-card:hover .kanban-card-del { opacity: 1; }
        .kanban-card-del:hover { color: #c0392b; }
        .kanban-addbtn { display: flex; align-items: center; gap: 6px; border: 1px dashed var(--line); background: none; color: var(--ink-4); font-size: 13px; font-weight: 600; padding: 9px; border-radius: 9px; cursor: pointer; transition: var(--transition); }
        .kanban-addbtn:hover { color: var(--accent); border-color: var(--accent); }
        .kanban-add input { width: 100%; padding: 9px 11px; border: 1px solid var(--accent); border-radius: 9px; font-size: 13.5px; color: var(--text-primary); background: var(--surface); }
        .kanban-add input:focus { outline: none; box-shadow: 0 0 0 3px var(--accent-weak); }
      `}</style>
    </div>
  );
}

// ── Панель деталей карточки ──
function CardDrawer({ card, users, appUsers, onClose, onPatchLocal, onError, onDelete }: {
  card: Card; users: KUser[]; appUsers: AppUser[]; onClose: () => void;
  onPatchLocal: (cardId: number, patch: Partial<Card>) => void;
  onError: (msg: string) => void; onDelete: (card: Card) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [desc, setDesc] = useState('');
  const [due, setDue] = useState(toDateInput(card.due_date));
  const [saving, setSaving] = useState(false);
  const [memBusy, setMemBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setTitle(card.title);
    setDue(toDateInput(card.due_date));
    api.get(`/api/kaiten/cards/${card.id}`).then(r => setDesc(r.data?.description || '')).catch(() => setDesc(card.description || ''));
  }, [card.id]);

  const members = card.members || [];
  const dirty = title !== card.title || desc !== (card.description || '') || due !== toDateInput(card.due_date);

  // Мост по email: пикер из сотрудников ШЕФ (резолв в Kaiten-аккаунт) + Kaiten-only «хвост».
  const shefByEmail = new Map(appUsers.map(u => [u.email.toLowerCase(), u]));
  const kaitenByEmail = new Map(users.filter(u => u.email).map(u => [u.email!.toLowerCase(), u]));
  const assignedEmails = new Set(members.map(m => (m.email || '').toLowerCase()).filter(Boolean));
  const assignedIds = new Set(members.map(m => m.id));
  const shefItems = appUsers
    .filter(su => !assignedEmails.has(su.email.toLowerCase()))
    .map(su => ({ su, ku: kaitenByEmail.get(su.email.toLowerCase()) }));
  const kaitenOnly = users.filter(u => !assignedIds.has(u.id) && !(u.email && shefByEmail.has(u.email.toLowerCase())));
  const hasPickable = shefItems.length > 0 || kaitenOnly.length > 0;

  async function save() {
    setSaving(true);
    try {
      const payload: any = { title, description: desc, due_date: due ? `${due}T00:00:00.000Z` : null };
      await api.patch(`/api/kaiten/cards/${card.id}`, payload);
      onPatchLocal(card.id, { title, description: desc, due_date: payload.due_date });
    } catch (e: any) {
      onError(e?.response?.data?.detail || 'Не удалось сохранить карточку');
    } finally { setSaving(false); }
  }

  async function addMember(u: KUser) {
    setMemBusy(true); setShowPicker(false);
    try {
      await api.post(`/api/kaiten/cards/${card.id}/members`, { user_id: u.id });
      onPatchLocal(card.id, { members: [...members, { id: u.id, full_name: u.full_name, username: u.username, email: u.email, initials: u.initials }] });
    } catch (e: any) {
      onError(e?.response?.data?.detail || 'Не удалось назначить исполнителя');
    } finally { setMemBusy(false); }
  }

  async function removeMember(m: Member) {
    setMemBusy(true);
    try {
      await api.delete(`/api/kaiten/cards/${card.id}/members/${m.id}`);
      onPatchLocal(card.id, { members: members.filter(x => x.id !== m.id) });
    } catch (e: any) {
      onError(e?.response?.data?.detail || 'Не удалось снять исполнителя');
    } finally { setMemBusy(false); }
  }

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="eyebrow">Карточка #{card.id}</span>
          <button className="drawer-x" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>

        <label className="field"><span>Заголовок</span><input value={title} onChange={e => setTitle(e.target.value)} /></label>
        <label className="field"><span>Описание</span><textarea rows={6} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Описание задачи…" /></label>
        <label className="field"><span>Срок</span><input type="date" value={due} onChange={e => setDue(e.target.value)} /></label>

        <div className="field">
          <span>Исполнители</span>
          <div className="mem-list">
            {members.map(m => {
              const rm = resolveMember(m, shefByEmail);
              return (
                <span key={m.id} className="mem-chip" title={rm.shef ? rm.sub : 'Профиль Kaiten'}>
                  <span className={`avatar-sm${rm.shef ? ' shef' : ''}`} style={{ margin: 0 }}>{rm.initials}</span>
                  {rm.name}
                  <button disabled={memBusy} onClick={() => removeMember(m)}><Icon name="close" size={12} /></button>
                </span>
              );
            })}
            <div className="mem-add">
              <button className="btn btn-ghost btn-sm" disabled={memBusy || !hasPickable} onClick={() => setShowPicker(v => !v)}><Icon name="plus" size={14} />Добавить</button>
              {showPicker && (
                <div className="mem-picker">
                  {shefItems.map(({ su, ku }) => (
                    <button key={`s${su.id}`} disabled={!ku} onClick={() => ku && addMember(ku)}>
                      <span className="avatar-sm shef" style={{ margin: 0 }}>{initialsOf({ full_name: su.full_name })}</span>
                      <span className="pick-name">{su.full_name}<span className="pick-sub">{su.role_name || (su.is_founder ? 'Основатель' : 'Сотрудник')}{!ku && ' · нет в Kaiten'}</span></span>
                    </button>
                  ))}
                  {kaitenOnly.length > 0 && <div className="pick-divider">Только в Kaiten</div>}
                  {kaitenOnly.map(u => (
                    <button key={`k${u.id}`} onClick={() => addMember(u)}>
                      <span className="avatar-sm" style={{ margin: 0 }}>{initialsOf(u)}</span>
                      <span className="pick-name">{u.full_name || u.username || u.email}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="drawer-actions">
          <button className="btn btn-primary btn-sm" disabled={!dirty || saving} onClick={save}><Icon name="check" size={15} />{saving ? 'Сохранение…' : 'Сохранить'}</button>
          <button className="btn btn-soft btn-sm" onClick={() => onDelete(card)}><Icon name="trash" size={15} />Удалить</button>
        </div>
      </aside>

      <style>{`
        .drawer-overlay { position: fixed; inset: 0; background: rgba(15,23,42,.28); z-index: 50; display: flex; justify-content: flex-end; }
        .drawer { width: 420px; max-width: 92vw; height: 100%; background: var(--surface); border-left: 1px solid var(--line); padding: 22px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; box-shadow: -8px 0 30px rgba(0,0,0,.12); animation: drawerIn .18s ease; }
        @keyframes drawerIn { from { transform: translateX(20px); opacity: .4; } to { transform: none; opacity: 1; } }
        .drawer-head { display: flex; align-items: center; justify-content: space-between; }
        .drawer-x { border: none; background: none; color: var(--ink-4); cursor: pointer; display: flex; }
        .drawer-x:hover { color: var(--text-primary); }
        .field { display: flex; flex-direction: column; gap: 6px; }
        .field > span { font-size: 12px; font-weight: 600; color: var(--ink-4); }
        .field input, .field textarea { padding: 10px 12px; border: 1px solid var(--line); border-radius: 9px; background: var(--surface); font-size: 14px; color: var(--text-primary); font-family: inherit; resize: vertical; }
        .field input:focus, .field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
        .mem-list { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .mem-chip { display: inline-flex; align-items: center; gap: 7px; padding: 4px 8px 4px 4px; border: 1px solid var(--line); border-radius: 20px; font-size: 12.5px; font-weight: 600; color: var(--text-primary); }
        .mem-chip button { border: none; background: none; color: var(--ink-4); cursor: pointer; display: flex; }
        .mem-chip button:hover { color: #c0392b; }
        .mem-add { position: relative; }
        .mem-picker { position: absolute; top: 100%; left: 0; margin-top: 6px; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,.12); padding: 6px; z-index: 5; min-width: 200px; max-height: 240px; overflow-y: auto; }
        .mem-picker button { display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: none; background: none; padding: 8px; border-radius: 7px; cursor: pointer; font-size: 13px; color: var(--text-primary); }
        .mem-picker button:hover:not(:disabled) { background: var(--surface-2); }
        .mem-picker button:disabled { opacity: .5; cursor: not-allowed; }
        .pick-name { display: flex; flex-direction: column; line-height: 1.2; text-align: left; }
        .pick-sub { font-size: 11px; color: var(--ink-4); font-weight: 500; }
        .pick-divider { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--ink-4); padding: 8px 8px 4px; }
        .drawer-actions { display: flex; gap: 10px; margin-top: auto; padding-top: 14px; border-top: 1px solid var(--line); }
      `}</style>
    </div>
  );
}
