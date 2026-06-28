import { describe, expect, it } from 'vitest';
import {
  importanceOf,
  isEvaluated,
  isTopPriority,
  levelOf,
  recordsInCell,
  unassignedRecords,
} from './projectHypothesisMap';
import type { RecordState } from './ProjectFrameworkSectionCanvas';

function rec(id: number, importance: string, uncertainty: string): RecordState {
  return { id, values: { importance, uncertainty } };
}

describe('projectHypothesisMap', () => {
  it('levelOf нормализует и отбрасывает мусор', () => {
    expect(levelOf(' Высокая ')).toBe('высокая');
    expect(levelOf('средняя')).toBe('средняя');
    expect(levelOf('')).toBe('');
    expect(levelOf('что-то')).toBe('');
  });

  it('isEvaluated требует обе оси', () => {
    expect(isEvaluated(rec(1, 'высокая', 'высокая'))).toBe(true);
    expect(isEvaluated(rec(2, 'высокая', ''))).toBe(false);
    expect(isEvaluated(rec(3, '', ''))).toBe(false);
  });

  it('isTopPriority — только важно+неизвестно', () => {
    expect(isTopPriority(rec(1, 'высокая', 'высокая'))).toBe(true);
    expect(isTopPriority(rec(2, 'высокая', 'низкая'))).toBe(false);
    expect(isTopPriority(rec(3, 'средняя', 'высокая'))).toBe(false);
  });

  it('recordsInCell фильтрует по обеим осям', () => {
    const records = [rec(1, 'высокая', 'высокая'), rec(2, 'высокая', 'низкая'), rec(3, 'высокая', 'высокая')];
    const cell = recordsInCell(records, 'высокая', 'высокая');
    expect(cell.map(r => r.id)).toEqual([1, 3]);
  });

  it('unassignedRecords — гипотезы без полной оценки', () => {
    const records = [rec(1, 'высокая', 'высокая'), rec(2, 'высокая', ''), rec(3, '', '')];
    expect(unassignedRecords(records).map(r => r.id)).toEqual([2, 3]);
  });

  it('importanceOf читает значение оси', () => {
    expect(importanceOf(rec(1, 'средняя', 'низкая'))).toBe('средняя');
  });
});
