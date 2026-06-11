import { describe, expect, it } from 'vitest';

import type { GoalDocument, Metric } from '../../types/goalDecomposition';
import {
  blockingGaps,
  isDecomposeBlocked,
  levelLock,
  measuredProgress,
  originMeta,
  statusMeta,
} from './logic';

function metric(over: Partial<Metric>): Metric {
  return { id: 'm', name: 'm', unit: 'чел.', source: 'derived', ...over };
}

function doc(periods: GoalDocument['periods']): GoalDocument {
  return {
    schemaVersion: '1.0.0',
    goal: {
      id: 'g', title: 't', startDate: '2026-07-01', deadline: '2026-12-31',
      targetMetrics: [], constraints: [], assumptions: [], dataGaps: [], status: 'draft',
    },
    periods,
    changeLog: [],
  };
}

function period(level: GoalDocument['periods'][number]['level'], status: GoalDocument['periods'][number]['approval']['status']) {
  return {
    id: `${level}-x`, level, index: 1, parentId: null,
    dateRange: { from: '2026-07-01', to: '2026-07-31' },
    allocatedMetrics: [], milestones: [], assumptions: [], dataGaps: [],
    approval: { status, proposedBy: 'ai' as const },
  };
}

describe('originMeta', () => {
  it('measured факт приоритетнее source', () => {
    const m = metric({ source: 'user_input', confidence: 'measured', currentValue: 4 });
    expect(originMeta(m).kind).toBe('measured');
  });
  it('derived → расчёт', () => {
    expect(originMeta(metric({ source: 'derived' })).label).toBe('расчёт');
  });
  it('assumption → допущение', () => {
    expect(originMeta(metric({ source: 'assumption', assumptionRef: 'a1' })).kind).toBe('assumption');
  });
  it('measured без currentValue не считается фактом', () => {
    expect(originMeta(metric({ source: 'derived', confidence: 'measured' })).kind).toBe('derived');
  });
});

describe('levelLock', () => {
  it('месяцы всегда открыты', () => {
    expect(levelLock(doc([]), 'MONTH').unlocked).toBe(true);
  });
  it('недели закрыты без согласованного месяца', () => {
    const l = levelLock(doc([period('MONTH', 'proposed_by_ai')]), 'WEEK');
    expect(l.unlocked).toBe(false);
    expect(l.reason).toContain('месяц');
  });
  it('недели открыты после approved месяца', () => {
    expect(levelLock(doc([period('MONTH', 'approved')]), 'WEEK').unlocked).toBe(true);
  });
  it('дни закрыты без согласованной недели', () => {
    expect(levelLock(doc([period('MONTH', 'approved')]), 'DAY').unlocked).toBe(false);
  });
});

describe('dataGaps', () => {
  const gaps = [
    { id: 'g1', requiredParameter: 'Бюджет', blocksDecomposition: true },
    { id: 'g2', requiredParameter: 'Прочее', blocksDecomposition: false },
  ];
  it('blockingGaps отбирает только блокирующие', () => {
    expect(blockingGaps(gaps).map(g => g.id)).toEqual(['g1']);
  });
  it('isDecomposeBlocked', () => {
    expect(isDecomposeBlocked(gaps)).toBe(true);
    expect(isDecomposeBlocked([gaps[1]])).toBe(false);
  });
});

describe('measuredProgress', () => {
  it('null без фактических замеров', () => {
    expect(measuredProgress([metric({ targetValue: 10 })])).toBeNull();
  });
  it('считает по measured currentValue', () => {
    const ms = [
      metric({ targetValue: 10, confidence: 'measured', currentValue: 4 }),
      metric({ targetValue: 0 }),
    ];
    expect(measuredProgress(ms)).toBe(40);
  });
});

describe('statusMeta', () => {
  it('approved → зелёный', () => {
    expect(statusMeta('approved').pill).toBe('pill-green');
  });
});
