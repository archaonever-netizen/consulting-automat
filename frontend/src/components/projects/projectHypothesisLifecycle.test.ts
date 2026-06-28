import { describe, expect, it } from 'vitest';
import {
  gateFor,
  gateHint,
  lifecycleOf,
  recordsInStage,
} from './projectHypothesisLifecycle';
import type { RecordState } from './ProjectFrameworkSectionCanvas';

const designed = {
  statement: 'если..то..потому что',
  confirmFact: '≥3',
  refuteFact: '0',
  method: 'интервью',
};
const ready = { ...designed, owner: 'Иванов', dueDate: '2026-07-01' };

function rec(id: number, values: Record<string, string>): RecordState {
  return { id, values };
}

describe('projectHypothesisLifecycle', () => {
  it('lifecycleOf по умолчанию — черновик', () => {
    expect(lifecycleOf(rec(1, {}))).toBe('черновик');
    expect(lifecycleOf(rec(2, { lifecycle: 'идёт' }))).toBe('идёт');
    expect(lifecycleOf(rec(3, { lifecycle: 'мусор' }))).toBe('черновик');
  });

  it('recordsInStage фильтрует по этапу', () => {
    const records = [rec(1, { lifecycle: 'идёт' }), rec(2, {}), rec(3, { lifecycle: 'идёт' })];
    expect(recordsInStage(records, 'идёт').map(r => r.id)).toEqual([1, 3]);
    expect(recordsInStage(records, 'черновик').map(r => r.id)).toEqual([2]);
  });

  it('ворота «спроектирована» требуют дизайн проверки', () => {
    expect(gateFor('спроектирована', {}).ok).toBe(false);
    expect(gateFor('спроектирована', {}).missing).toContain('факт опровержения');
    expect(gateFor('спроектирована', designed).ok).toBe(true);
  });

  it('ворота «идёт» дополнительно требуют владельца и срок', () => {
    const partial = gateFor('идёт', designed);
    expect(partial.ok).toBe(false);
    expect(partial.missing).toEqual(['владелец', 'срок проверки']);
    expect(gateFor('идёт', ready).ok).toBe(true);
  });

  it('этапы без ворот — свободный переход', () => {
    expect(gateFor('результат', {}).ok).toBe(true);
    expect(gateFor('закрыта', {}).ok).toBe(true);
    expect(gateFor('черновик', {}).ok).toBe(true);
  });

  it('gateHint есть только у этапов с воротами', () => {
    expect(gateHint('идёт')).toContain('владелец');
    expect(gateHint('результат')).toBeNull();
  });
});
