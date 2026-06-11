import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Icon from '../components/Icon';
import {
  approvePeriod,
  confirmAssumption,
  decompose,
  editPeriod,
  getAlternatives,
  getGoal,
  recalculate,
  rejectPeriod,
  updateDataset,
} from '../services/goals';
import type {
  Assumption,
  DataGap,
  GoalDocument,
  Metric,
  MetricDiffRow,
  Period,
  PeriodLevel,
  ProposalResponse,
} from '../types/goalDecomposition';
import {
  isDecomposeBlocked,
  levelLock,
  measuredProgress,
  originMeta,
  statusMeta,
} from './goals/logic';
import '../styles/goals.css';

const LEVELS: { key: PeriodLevel; label: string }[] = [
  { key: 'MONTH', label: 'Месяцы' },
  { key: 'WEEK', label: 'Недели' },
  { key: 'DAY', label: 'Дни' },
];

function childLevelOf(level: PeriodLevel): PeriodLevel | null {
  if (level === 'MONTH') return 'WEEK';
  if (level === 'WEEK') return 'DAY';
  return null;
}

function apiError(err: unknown): string {
  const e = err as { response?: { data?: { detail?: unknown } } };
  return typeof e.response?.data?.detail === 'string' ? e.response.data.detail : 'Ошибка операции';
}

// ─────────────────────────── метрика с раскрытием происхождения ───────────────────────────

function MetricChip({ metric }: { metric: Metric }) {
  const [open, setOpen] = useState(false);
  const meta = originMeta(metric);
  const expandable = meta.kind === 'derived' || meta.kind === 'assumption';
  return (
    <div className={'metric-chip ' + meta.cls}>
      <button className="mc-head" onClick={() => expandable && setOpen(o => !o)} disabled={!expandable}>
        <span className="mc-dot" />
        <span className="mc-name">{metric.name}</span>
        {metric.aggregation === 'endpoint' && <span className="mc-agg" title="Уровень к финишу: значение достигается к концу">к финишу</span>}
        <span className="mc-val">{metric.targetValue ?? '—'} {metric.unit}</span>
        <span className="mc-origin">{meta.label}</span>
      </button>
      {open && meta.kind === 'derived' && metric.derivation && (
        <div className="mc-detail"><b>Формула:</b> {metric.derivation.formula}
          {metric.derivation.inputs.length > 0 && <> · входы: {metric.derivation.inputs.join(', ')}</>}</div>
      )}
      {open && meta.kind === 'assumption' && (
        <div className="mc-detail">Допущение {metric.assumptionRef ? `(${metric.assumptionRef})` : ''} — требует подтверждения</div>
      )}
    </div>
  );
}

// ─────────────────────────── карточка периода ───────────────────────────

interface PeriodCardProps {
  period: Period;
  hasChildren: boolean;
  onApprove: () => void;
  onReject: () => void;
  onEdit: (metricId: string) => void;
  onDecompose: () => void;
  busy: boolean;
}

function PeriodCard({ period, hasChildren, onApprove, onReject, onEdit, onDecompose, busy }: PeriodCardProps) {
  const s = statusMeta(period.approval.status);
  const childLevel = childLevelOf(period.level);
  const canApprove = ['proposed_by_ai', 'under_review', 'needs_revision'].includes(period.approval.status);
  const isApproved = period.approval.status === 'approved';
  return (
    <div className="period-card">
      <div className="pc-head">
        <div className="pc-id">
          <b>{period.level === 'MONTH' ? 'Месяц' : period.level === 'WEEK' ? 'Неделя' : 'День'} {period.index}</b>
          <span className="pc-dates">{period.dateRange.from} → {period.dateRange.to}</span>
        </div>
        <span className={'pill ' + s.pill}>{s.label}</span>
      </div>

      <div className="pc-metrics">
        {period.allocatedMetrics.map(m => (
          <div className="pc-metric-line" key={m.id}>
            <MetricChip metric={m} />
            <button className="mc-edit" title="Править значение" onClick={() => onEdit(m.id)}><Icon name="edit" size={14} /></button>
          </div>
        ))}
      </div>

      {period.milestones.length > 0 && (
        <ul className="pc-milestones">
          {period.milestones.map((ms, i) => (
            <li key={i}>
              <Icon name="check" size={13} /> {ms.title} <span className="ms-date">· {ms.dueDate}</span>
              {ms.dependsOn && ms.dependsOn.length > 0 && <span className="ms-dep"> ← {ms.dependsOn.join(', ')}</span>}
            </li>
          ))}
        </ul>
      )}

      <div className="pc-actions">
        {canApprove && <button className="btn btn-primary btn-sm" disabled={busy} onClick={onApprove}>Согласовать</button>}
        {canApprove && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onReject}>Отклонить</button>}
        {isApproved && childLevel && !hasChildren && (
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onDecompose}>
            <Icon name="sparkle" size={14} />Разбить на {childLevel === 'WEEK' ? 'недели' : 'дни'}
          </button>
        )}
        {isApproved && childLevel && hasChildren && <span className="pc-hint">Уже разбит</span>}
      </div>
    </div>
  );
}

// ─────────────────────────── страница ───────────────────────────

export default function GoalDecompositionPage() {
  const { goalId = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<GoalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<PeriodLevel>('MONTH');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [gapInputs, setGapInputs] = useState<Record<string, string>>({});
  const [diffs, setDiffs] = useState<MetricDiffRow[] | null>(null);
  const [alts, setAlts] = useState<ProposalResponse | null>(null);

  const refresh = useCallback(async () => {
    const data = await getGoal(goalId);
    setDoc(data.document);
    setLoading(false);
  }, [goalId]);

  // Первичная загрузка: setState в .then-колбэке (синхронный setState в эффекте
  // правило react-hooks/set-state-in-effect не разрешает).
  useEffect(() => {
    let alive = true;
    getGoal(goalId)
      .then(data => { if (alive) setDoc(data.document); })
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [goalId]);

  const handleProposal = useCallback((p: ProposalResponse) => {
    if (p.status === 'blocked') setNotice('Не хватает данных — заполните блок «Что мне нужно от вас».');
    else if (p.status === 'error') setNotice(p.error || 'Не удалось получить корректное разбиение.');
    else setNotice('');
  }, []);

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    try {
      return await fn();
    } catch (err) {
      setNotice(apiError(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  if (loading || !doc) return <div className="page"><div className="loading-bar" /></div>;

  const allGaps: DataGap[] = [
    ...doc.goal.dataGaps,
    ...doc.periods.flatMap(p => p.dataGaps),
  ];
  const allAssumptions: { a: Assumption; scope: string }[] = [
    ...doc.goal.assumptions.map(a => ({ a, scope: 'Цель' })),
    ...doc.periods.flatMap(p => p.assumptions.map(a => ({ a, scope: `Период ${p.index}` }))),
  ];
  const hasMonths = doc.periods.some(p => p.level === 'MONTH');
  const progress = measuredProgress(doc.periods.flatMap(p => p.allocatedMetrics));
  const goalBlocked = isDecomposeBlocked(doc.goal.dataGaps);

  async function decomposeGoal() {
    const p = await run(() => decompose(goalId, 'MONTH', null));
    if (p) { handleProposal(p); await refresh(); }
  }
  async function decomposeParent(period: Period) {
    const child = childLevelOf(period.level);
    if (!child) return;
    const p = await run(() => decompose(goalId, child, period.id));
    if (p) { handleProposal(p); await refresh(); }
  }
  async function doApprove(period: Period) {
    const r = await run(() => approvePeriod(goalId, period.id));
    if (r) await refresh();
  }
  async function doReject(period: Period) {
    const reason = window.prompt('Причина отклонения:') || '';
    if (!reason.trim()) return;
    const r = await run(() => rejectPeriod(goalId, period.id, reason.trim()));
    if (r) await refresh();
  }
  async function doEdit(period: Period, metricId: string) {
    const raw = window.prompt('Новое значение метрики (число):');
    if (raw === null) return;
    const value = raw.trim() === '' ? null : Number(raw);
    const r = await run(() => editPeriod(goalId, period.id, [{ metricId, targetValue: value }]));
    if (r) await refresh();
  }
  async function doRecalc() {
    const r = await run(() => recalculate(goalId, null));
    if (!r) return;
    if (r.diffs) { setDiffs(r.diffs); await refresh(); }
    else setNotice(r.error || 'Пересчёт не выполнен: модель не дала корректное разбиение.');
  }
  async function showAlternatives() {
    const r = await run(() => getAlternatives(goalId, 'MONTH', null, 3));
    if (r) setAlts(r);
  }
  async function fillGap(gap: DataGap) {
    const raw = gapInputs[gap.id];
    if (raw == null || raw.trim() === '') return;
    const value = isNaN(Number(raw)) ? raw : Number(raw);
    const r = await run(() => updateDataset(goalId, { [gap.requiredParameter]: value }));
    if (r) { setGapInputs(g => ({ ...g, [gap.id]: '' })); setNotice('Данные сохранены. Можно запускать декомпозицию.'); }
  }
  async function decideAssumption(a: Assumption, status: 'confirmed' | 'rejected') {
    const r = await run(() => confirmAssumption(goalId, a.id, status));
    if (r) {
      if (r.impacted.length > 0) setNotice(`Затронуты согласованные узлы (${r.impacted.length}) — рекомендуется пересчёт.`);
      await refresh();
    }
  }

  const periodsAtLevel = doc.periods.filter(p => p.level === active).sort((x, y) => x.index - y.index);

  return (
    <div className="page goals-page">
      <button className="back-link" onClick={() => navigate('/goals')}><Icon name="arrowLeft" size={16} />К целям</button>

      <div className="page-head rise">
        <div>
          <h1>{doc.goal.title}</h1>
          <p>{doc.goal.startDate} → {doc.goal.deadline} · статус: {doc.goal.status}</p>
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" disabled={busy} onClick={showAlternatives}><Icon name="share" size={16} />Альтернативы</button>
          {hasMonths && <button className="btn btn-ghost" disabled={busy} onClick={doRecalc}><Icon name="clock" size={16} />Пересчитать</button>}
          {!hasMonths && (
            <button className="btn btn-primary" disabled={busy || goalBlocked} onClick={decomposeGoal}
              title={goalBlocked ? 'Сначала заполните блокирующие данные' : ''}>
              <Icon name="sparkle" size={16} />Декомпозировать на месяцы
            </button>
          )}
        </div>
      </div>

      {progress != null && (
        <div className="progress-strip rise d1">
          <span>Прогресс по фактическим замерам</span>
          <div className="pbar"><div className="pbar-fill" style={{ width: `${progress}%` }} /></div>
          <b>{progress}%</b>
        </div>
      )}

      {notice && <div className="notice rise">{notice}<button onClick={() => setNotice('')}><Icon name="close" size={14} /></button></div>}

      <div className="goals-layout">
        <div className="goals-main">
          <div className="level-tabs rise d1">
            {LEVELS.map(l => {
              const lock = levelLock(doc, l.key);
              const count = doc.periods.filter(p => p.level === l.key).length;
              return (
                <button key={l.key}
                  className={'lvl-tab' + (active === l.key ? ' on' : '') + (lock.unlocked ? '' : ' locked')}
                  onClick={() => lock.unlocked ? setActive(l.key) : setNotice(lock.reason)}
                  title={lock.unlocked ? '' : lock.reason}>
                  {!lock.unlocked && <Icon name="stop" size={13} />}
                  {l.label}{count > 0 && <span className="lvl-count">{count}</span>}
                </button>
              );
            })}
          </div>

          {periodsAtLevel.length === 0 ? (
            <div className="empty-tab">
              <div className="ei"><Icon name="grid" size={22} /></div>
              <b>Уровень ещё не разбит</b>
              <span>{active === 'MONTH' ? 'Запустите декомпозицию цели на месяцы.' : 'Согласуйте родительский период и разбейте его.'}</span>
            </div>
          ) : (
            <div className="periods-grid">
              {periodsAtLevel.map(p => (
                <PeriodCard key={p.id} period={p} busy={busy}
                  hasChildren={doc.periods.some(c => c.parentId === p.id)}
                  onApprove={() => doApprove(p)}
                  onReject={() => doReject(p)}
                  onEdit={(mid) => doEdit(p, mid)}
                  onDecompose={() => decomposeParent(p)} />
              ))}
            </div>
          )}
        </div>

        <aside className="goals-side">
          <section className="side-box">
            <h3><Icon name="help" size={16} />Что мне нужно от вас</h3>
            {allGaps.length === 0 ? <p className="side-empty">Все необходимые данные на месте.</p> : (
              <ul className="gap-list">
                {allGaps.map(g => (
                  <li key={g.id} className={g.blocksDecomposition ? 'gap blocking' : 'gap'}>
                    <div className="gap-name">{g.requiredParameter}{g.expectedUnit ? `, ${g.expectedUnit}` : ''}
                      {g.blocksDecomposition && <span className="gap-flag">блокирует</span>}</div>
                    {g.whyNeeded && <div className="gap-why">{g.whyNeeded}</div>}
                    <div className="gap-fill">
                      <input className="form-input" placeholder={g.expectedUnit || 'значение'}
                        value={gapInputs[g.id] ?? ''} onChange={e => setGapInputs(s => ({ ...s, [g.id]: e.target.value }))} />
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => fillGap(g)}>ОК</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="side-box">
            <h3><Icon name="feedback" size={16} />Реестр допущений</h3>
            {allAssumptions.length === 0 ? <p className="side-empty">Допущений пока нет.</p> : (
              <ul className="assum-list">
                {allAssumptions.map(({ a, scope }) => (
                  <li key={a.id} className={'assum ' + a.status}>
                    <div className="assum-top">
                      <span className="assum-statement">{a.statement}</span>
                      <span className={'pill ' + (a.status === 'confirmed' ? 'pill-green' : a.status === 'rejected' ? 'pill-red' : 'pill-amber')}>{a.status}</span>
                    </div>
                    <div className="assum-meta">
                      {scope} · {a.assumedValue}{a.unit ? ` ${a.unit}` : ''}
                      {a.needsConfirmationFrom && <> · подтверждает: {a.needsConfirmationFrom}</>}
                      {a.impact && a.impact.length > 0 && <> · влияет на {a.impact.length}</>}
                    </div>
                    {a.status === 'unconfirmed' && (
                      <div className="assum-actions">
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decideAssumption(a, 'confirmed')}>Подтвердить</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy}
                          onClick={() => setNotice(`Уточните у: ${a.needsConfirmationFrom || 'ответственного'}`)}>Уточнить</button>
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => decideAssumption(a, 'rejected')}>Отклонить</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="side-box">
            <h3><Icon name="clock" size={16} />Лента аудита</h3>
            <ul className="audit-list">
              {[...doc.changeLog].reverse().slice(0, 30).map(e => (
                <li key={e.id} className="audit">
                  <span className={'audit-actor ' + e.actor.kind}><Icon name={e.actor.kind === 'ai' ? 'sparkle' : 'users'} size={13} /></span>
                  <div>
                    <div className="audit-act">{e.action}{e.field ? ` · ${e.field}` : ''}{e.triggeredRecalculation ? ' · пересчёт' : ''}</div>
                    <div className="audit-meta">{e.entityRef}{e.reason ? ` — ${e.reason}` : ''}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {diffs && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setDiffs(null); }}>
          <div className="modal-card modal-wide">
            <h3 className="modal-title">Дифф пересчёта</h3>
            {diffs.length === 0 ? <p className="modal-text">Изменений нет.</p> : (
              <table className="diff-table">
                <thead><tr><th>Период</th><th>Метрика</th><th>Было</th><th>Стало</th><th></th></tr></thead>
                <tbody>
                  {diffs.map((d, i) => (
                    <tr key={i}>
                      <td>{d.periodId}</td><td>{d.metricId}</td>
                      <td>{d.oldValue ?? '—'}</td><td>{d.newValue ?? '—'}</td>
                      <td>{d.preserved ? <span className="pill pill-green">правка сохранена</span> : <span className="pill pill-gray">обновлено</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setDiffs(null)}>Понятно</button>
            </div>
          </div>
        </div>
      )}

      {alts && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={e => { if (e.target === e.currentTarget) setAlts(null); }}>
          <div className="modal-card modal-wide">
            <h3 className="modal-title">Альтернативы разбиения</h3>
            {alts.alternatives.length === 0 ? <p className="modal-text">Прошедших проверку альтернатив нет.</p> : (
              <div className="alt-list">
                {alts.alternatives.map((alt, i) => (
                  <div className="alt-item" key={i}>
                    <b>{alt.label || `Вариант ${i + 1}`}</b>
                    {alt.tradeoff && <span className="alt-tradeoff">{alt.tradeoff}</span>}
                    <span className="alt-count">{alt.children.length} периодов</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={() => setAlts(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
