import { describe, expect, it } from 'vitest';
import {
  canConcludeVerdict,
  checkStatusLevel,
  gateFor,
  gateHint,
  recordsInStage,
  stageOf,
  suggestVerdict,
  verdictGate,
  verdictOf,
} from './projectCheckStage';
import { createEvidence, serializeEvidence, type Evidence } from './projectCheckEvidence';
import type { RecordState } from './ProjectFrameworkSectionCanvas';

// Полный дизайн проверки (все поля критерия заданы заранее).
const designed = {
  hypothesis: 'Заводам важна скорость',
  subject: 'Опрос 10 заводов',
  method: 'интервью',
  metric: 'доля согласных',
  confirmThreshold: '≥3 из 10',
  refuteThreshold: '≤1 из 10',
};

const withEvidence = (values: Record<string, string>, items: Evidence[]) => ({
  ...values,
  evidence: serializeEvidence(items),
});

function rec(id: number, values: Record<string, string>): RecordState {
  return { id, values };
}

describe('projectCheckStage', () => {
  it('stageOf по умолчанию — дизайн', () => {
    expect(stageOf(rec(1, {}))).toBe('дизайн');
    expect(stageOf(rec(2, { stage: 'оценка' }))).toBe('оценка');
    expect(stageOf(rec(3, { stage: 'мусор' }))).toBe('дизайн');
  });

  it('recordsInStage фильтрует по этапу', () => {
    const records = [rec(1, { stage: 'сбор' }), rec(2, {}), rec(3, { stage: 'сбор' })];
    expect(recordsInStage(records, 'сбор').map(r => r.id)).toEqual([1, 3]);
    expect(recordsInStage(records, 'дизайн').map(r => r.id)).toEqual([2]);
  });

  it('ворота «сбор» требуют готовый дизайн (критерий задан заранее)', () => {
    const empty = gateFor('сбор', {});
    expect(empty.ok).toBe(false);
    expect(empty.missing).toContain('порог подтверждения');
    expect(gateFor('сбор', designed).ok).toBe(true);
  });

  it('ворота «оценка» дополнительно требуют свидетельство', () => {
    expect(gateFor('оценка', designed).ok).toBe(false);
    expect(gateFor('оценка', designed).missing).toEqual(['хотя бы одно свидетельство']);
    const values = withEvidence(designed, [createEvidence({ stance: 'за' })]);
    expect(gateFor('оценка', values).ok).toBe(true);
  });

  it('ворота «вердикт» дополнительно требуют измеренное значение', () => {
    const noMeasure = withEvidence(designed, [createEvidence({ stance: 'за' })]);
    expect(gateFor('вердикт', noMeasure).ok).toBe(false);
    expect(gateFor('вердикт', noMeasure).missing).toEqual(['измеренное значение в свидетельстве']);
    const measured = withEvidence(designed, [createEvidence({ stance: 'за', measuredValue: '4 из 10' })]);
    expect(gateFor('вердикт', measured).ok).toBe(true);
  });

  it('ворота «следствие» дополнительно требуют зафиксированный вердикт', () => {
    const measured = withEvidence(designed, [createEvidence({ stance: 'за', measuredValue: '4 из 10' })]);
    expect(gateFor('следствие', measured).ok).toBe(false);
    expect(gateFor('следствие', measured).missing).toEqual(['зафиксированный вердикт']);
    expect(gateFor('следствие', { ...measured, result: 'подтверждена' }).ok).toBe(true);
  });

  it('этап «дизайн» — старт без ворот', () => {
    expect(gateFor('дизайн', {}).ok).toBe(true);
  });

  it('gateHint есть у этапов с воротами и null у «дизайна»', () => {
    expect(gateHint('сбор')).toContain('порог подтверждения');
    expect(gateHint('дизайн')).toBeNull();
  });

  it('verdictGate закрыт без критерия/свидетельства/измерения', () => {
    expect(verdictGate({}).ok).toBe(false);
    const measured = withEvidence(designed, [createEvidence({ stance: 'за', measuredValue: '4' })]);
    expect(canConcludeVerdict(measured)).toBe(true);
  });

  it('suggestVerdict: недостаточно данных, пока ворота закрыты', () => {
    expect(suggestVerdict({})).toBe('недостаточно данных');
    expect(suggestVerdict(designed)).toBe('недостаточно данных'); // нет свидетельств
  });

  it('suggestVerdict: перевес «за» → подтверждена, «против» → опровергнута, поровну → недостаточно', () => {
    const forWins = withEvidence(designed, [
      createEvidence({ stance: 'за', measuredValue: '4' }),
      createEvidence({ stance: 'за' }),
      createEvidence({ stance: 'против' }),
    ]);
    expect(suggestVerdict(forWins)).toBe('подтверждена');

    const againstWins = withEvidence(designed, [
      createEvidence({ stance: 'против', measuredValue: '1' }),
      createEvidence({ stance: 'против' }),
      createEvidence({ stance: 'за' }),
    ]);
    expect(suggestVerdict(againstWins)).toBe('опровергнута');

    const tie = withEvidence(designed, [
      createEvidence({ stance: 'за', measuredValue: '2' }),
      createEvidence({ stance: 'против' }),
    ]);
    expect(suggestVerdict(tie)).toBe('недостаточно данных');
  });

  it('verdictOf читает поле result и игнорирует мусор', () => {
    expect(verdictOf(rec(1, { result: 'подтверждена' }))).toBe('подтверждена');
    expect(verdictOf(rec(2, { result: 'может быть' }))).toBeNull();
    expect(verdictOf(rec(3, {}))).toBeNull();
  });

  it('checkStatusLevel: подтверждена → green, опровергнута → red, иначе → amber', () => {
    expect(checkStatusLevel(rec(1, { result: 'подтверждена' }))).toBe('green');
    expect(checkStatusLevel(rec(2, { result: 'опровергнута' }))).toBe('red');
    expect(checkStatusLevel(rec(3, { result: 'недостаточно данных' }))).toBe('amber');
    expect(checkStatusLevel(rec(4, {}))).toBe('amber');
  });
});
