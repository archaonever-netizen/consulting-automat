// Чистая UI-логика декомпозиции целей (без React) — покрыта vitest.
import type {
  ApprovalStatus,
  DataGap,
  GoalDocument,
  Metric,
  PeriodLevel,
} from '../../types/goalDecomposition';

export interface OriginMeta {
  kind: 'measured' | 'input' | 'derived' | 'assumption';
  cls: string;
  label: string;
}

// Происхождение метрики → цветовая кодировка. measured (факт) приоритетнее source.
export function originMeta(m: Metric): OriginMeta {
  if (m.confidence === 'measured' && m.currentValue != null) {
    return { kind: 'measured', cls: 'org-measured', label: 'факт' };
  }
  switch (m.source) {
    case 'user_input':
      return { kind: 'input', cls: 'org-input', label: 'из данных' };
    case 'derived':
      return { kind: 'derived', cls: 'org-derived', label: 'расчёт' };
    case 'assumption':
      return { kind: 'assumption', cls: 'org-assumption', label: 'допущение' };
    default:
      return { kind: 'input', cls: 'org-input', label: 'из данных' };
  }
}

export interface StatusMeta {
  label: string;
  pill: string;
}

const STATUS: Record<ApprovalStatus, StatusMeta> = {
  draft: { label: 'Черновик', pill: 'pill-gray' },
  proposed_by_ai: { label: 'Предложено ИИ', pill: 'pill-amber' },
  under_review: { label: 'На проверке', pill: 'pill-amber' },
  approved: { label: 'Согласовано', pill: 'pill-green' },
  rejected: { label: 'Отклонено', pill: 'pill-red' },
  needs_revision: { label: 'Нужна доработка', pill: 'pill-amber' },
};

export function statusMeta(s: ApprovalStatus): StatusMeta {
  return STATUS[s] ?? { label: s, pill: 'pill-gray' };
}

export interface LevelLock {
  unlocked: boolean;
  reason: string;
}

// Недели открыты только после согласованного месяца; дни — после согласованной недели.
export function levelLock(doc: GoalDocument, level: PeriodLevel): LevelLock {
  if (level === 'MONTH') return { unlocked: true, reason: '' };
  const approvedAt = (lvl: PeriodLevel) =>
    doc.periods.some(p => p.level === lvl && p.approval.status === 'approved');
  if (level === 'WEEK') {
    return approvedAt('MONTH')
      ? { unlocked: true, reason: '' }
      : { unlocked: false, reason: 'Сначала согласуйте хотя бы один месяц' };
  }
  return approvedAt('WEEK')
    ? { unlocked: true, reason: '' }
    : { unlocked: false, reason: 'Сначала согласуйте хотя бы одну неделю' };
}

// Блокирующие пробелы данных не дают запускать декомпозицию.
export function blockingGaps(gaps: DataGap[]): DataGap[] {
  return gaps.filter(g => g.blocksDecomposition);
}

export function isDecomposeBlocked(gaps: DataGap[]): boolean {
  return blockingGaps(gaps).length > 0;
}

// Прогресс — ТОЛЬКО по фактическим замерам (measured + currentValue), не по плану.
export function measuredProgress(metrics: Metric[]): number | null {
  let target = 0;
  let measured = 0;
  let hasMeasure = false;
  for (const m of metrics) {
    if (m.targetValue != null) target += m.targetValue;
    if (m.confidence === 'measured' && m.currentValue != null) {
      measured += m.currentValue;
      hasMeasure = true;
    }
  }
  if (!hasMeasure || target <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((measured / target) * 100)));
}

export function impactCount(impact?: string[]): number {
  return impact ? impact.length : 0;
}
