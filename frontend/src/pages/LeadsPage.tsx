import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import Icon from '../components/Icon';

interface Lead {
  id: number;
  name: string;
  contact: string;
  note: string | null;
  status: 'new' | 'in_progress' | 'done';
  consent: boolean;
  consent_at: string | null;
  policy_version: string | null;
  source: string | null;
  created_at: string | null;
  created_at_fmt: string;
}

type StatusKey = 'new' | 'in_progress' | 'done';

const STATUS_LABEL: Record<StatusKey, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Обработана',
};
const STATUS_PILL: Record<StatusKey, string> = {
  new: 'pill-amber',
  in_progress: 'pill-gray',
  done: 'pill-green',
};

function fmtConsentAt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('ru-RU');
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const { data: leads = [], isLoading: loading } = useQuery<Lead[]>({
    queryKey: ['leads'],
    queryFn: async () => (await api.get('/api/leads')).data,
  });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | StatusKey>('all');
  const [detail, setDetail] = useState<Lead | null>(null);
  const [confirm, setConfirm] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: ['leads'] });
  }

  async function setStatus(lead: Lead, status: StatusKey) {
    if (lead.status === status) return;
    try {
      await api.patch(`/api/leads/${lead.id}`, { status });
      setDetail(d => (d && d.id === lead.id ? { ...d, status } : d));
      await reload();
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Не удалось изменить статус');
    }
  }

  async function doDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api.delete(`/api/leads/${confirm.id}`);
      if (detail?.id === confirm.id) setDetail(null);
      await reload();
      setConfirm(null);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = leads.filter(l => {
    const matchQ = !q
      || l.name.toLowerCase().includes(q)
      || l.contact.toLowerCase().includes(q)
      || (l.note || '').toLowerCase().includes(q);
    const matchF = filter === 'all' || l.status === filter;
    return matchQ && matchF;
  });

  const total = leads.length;
  const countNew = leads.filter(l => l.status === 'new').length;
  const countWork = leads.filter(l => l.status === 'in_progress').length;
  const countDone = leads.filter(l => l.status === 'done').length;

  if (loading) return <div className="page"><div className="loading-bar"></div></div>;

  return (
    <div className="page">
      <div className="page-head rise">
        <div>
          <h1>Заявки</h1>
          <p>Обращения с публичного лендинга. По каждой зафиксировано согласие на обработку персональных данных.</p>
        </div>
      </div>

      <div className="stats-strip rise d1">
        <div className="stat"><div className="k"><Icon name="feedback" size={15} />Всего заявок</div><div className="v">{total}</div></div>
        <div className="stat"><div className="k"><Icon name="clock" size={15} />Новые</div><div className="v">{countNew}</div></div>
        <div className="stat"><div className="k"><Icon name="bolt" size={15} />В работе</div><div className="v">{countWork}</div></div>
        <div className="stat"><div className="k"><Icon name="check" size={15} />Обработаны</div><div className="v">{countDone}</div><div className="d up">{total ? Math.round(countDone / total * 100) : 0}% закрыто</div></div>
      </div>

      <div className="toolbar rise d2">
        <div className="search">
          <Icon name="search" size={17} />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по имени, контакту, тексту…" />
        </div>
        <div className="seg">
          {([['all', 'Все'], ['new', 'Новые'], ['in_progress', 'В работе'], ['done', 'Обработаны']] as const).map(([k, l]) => (
            <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="empty-tab">
          <div className="ei"><Icon name="feedback" size={24} /></div>
          <b>{leads.length === 0 ? 'Пока нет заявок' : 'Ничего не найдено'}</b>
          <span>{leads.length === 0 ? 'Здесь появятся обращения, отправленные через форму на лендинге.' : 'Измените запрос или фильтр.'}</span>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="clients-table">
          <div className="ct-row head" style={{ gridTemplateColumns: '1.4fr 1.2fr 2fr 1fr 0.5fr' }}>
            <span>Заявка</span><span>Контакт</span><span>Сообщение</span><span>Статус · дата</span><span></span>
          </div>
          {filtered.map(l => (
            <div key={l.id} className="ct-row" style={{ gridTemplateColumns: '1.4fr 1.2fr 2fr 1fr 0.5fr' }} onClick={() => setDetail(l)}>
              <div style={{ minWidth: 0 }}>
                <b style={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.name}</b>
                <span style={{ fontSize: 12.5, color: 'var(--ink-3)', fontWeight: 600 }}>{l.created_at_fmt}</span>
              </div>
              <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.contact}</span>
              <span style={{ minWidth: 0, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {l.note || '—'}
              </span>
              <span style={{ display: 'flex', alignItems: 'center' }}>
                <span className={'pill ' + STATUS_PILL[l.status]}>{STATUS_LABEL[l.status]}</span>
              </span>
              <div className="cc-actions" style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                <button className="del" title="Удалить" onClick={() => setConfirm(l)}><Icon name="trash" size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="modal-card" style={{ maxWidth: 560 }}>
            <h3 className="modal-title" style={{ marginBottom: 4 }}>{detail.name}</h3>
            <p className="modal-text" style={{ marginTop: 0 }}>Заявка №{detail.id} · {detail.created_at_fmt}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, margin: '18px 0 22px' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Контакт</div>
                <div style={{ fontSize: 15 }}>{detail.contact}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Сообщение</div>
                <div style={{ fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detail.note || '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Статус</div>
                <div className="seg" style={{ display: 'inline-flex' }}>
                  {(['new', 'in_progress', 'done'] as const).map(k => (
                    <button key={k} className={detail.status === k ? 'on' : ''} onClick={() => setStatus(detail, k)}>{STATUS_LABEL[k]}</button>
                  ))}
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ink-3)', marginBottom: 4 }}>Согласие на обработку ПДн</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {detail.consent ? '✓ дано' : '— не зафиксировано'}
                  {' · '}{fmtConsentAt(detail.consent_at)}
                  {detail.policy_version ? ` · редакция ${detail.policy_version}` : ''}
                  {detail.source ? <><br />Источник: {detail.source}</> : null}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--danger)' }} onClick={() => setConfirm(detail)}>Удалить</button>
              <button type="button" className="btn btn-primary" onClick={() => setDetail(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="modal-overlay" style={{ display: 'flex', zIndex: 60 }} onClick={e => { if (e.target === e.currentTarget) setConfirm(null); }}>
          <div className="modal-card">
            <h3 className="modal-title">Удалить заявку?</h3>
            <p className="modal-text">Заявка от «{confirm.name}» будет удалена без возможности восстановления.</p>
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
