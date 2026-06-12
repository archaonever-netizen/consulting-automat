import { describe, expect, it } from 'vitest';
import {
  buildTaskPayload,
  canComplete,
  emptyTaskForm,
  isoToLocalInput,
  taskToForm,
} from './logic';

describe('buildTaskPayload', () => {
  it('собирает payload, обрезая пробелы и превращая пустое в null', () => {
    const p = buildTaskPayload({
      title: '  Позвонить клиенту  ',
      client_id: '7',
      goal: '',
      action_description: '  ',
      expected_result: 'Встреча назначена',
      start_time: '2026-06-15T10:30',
      duration_minutes: '45',
    });
    expect(p).toEqual({
      title: 'Позвонить клиенту',
      client_id: 7,
      goal: null,
      action_description: null,
      expected_result: 'Встреча назначена',
      start_time: '2026-06-15T10:30:00',
      duration_minutes: 45,
    });
  });

  it('возвращает null без названия или клиента', () => {
    expect(buildTaskPayload({ ...emptyTaskForm(), client_id: '1' })).toBeNull();
    expect(buildTaskPayload({ ...emptyTaskForm(), title: 'x' })).toBeNull();
  });

  it('пустые дата и длительность уходят как null', () => {
    const p = buildTaskPayload({ ...emptyTaskForm(), title: 'x', client_id: '1' });
    expect(p?.start_time).toBeNull();
    expect(p?.duration_minutes).toBeNull();
  });

  it('нечисловая длительность не ломает payload', () => {
    const p = buildTaskPayload({
      ...emptyTaskForm(), title: 'x', client_id: '1', duration_minutes: 'abc',
    });
    expect(p?.duration_minutes).toBeNull();
  });
});

describe('taskToForm / isoToLocalInput', () => {
  it('дата из API режется до формата datetime-local без сдвига зон', () => {
    expect(isoToLocalInput('2026-06-15T10:30:00')).toBe('2026-06-15T10:30');
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput(undefined)).toBe('');
  });

  it('задача превращается в форму с дефолтами для пустых полей', () => {
    const f = taskToForm({ title: 'T', client_id: 3, goal: null, start_time: '2026-06-15T10:30:00' });
    expect(f.title).toBe('T');
    expect(f.client_id).toBe('3');
    expect(f.goal).toBe('');
    expect(f.start_time).toBe('2026-06-15T10:30');
    expect(f.duration_minutes).toBe('');
  });

  it('форма из задачи проходит обратно в payload без потерь', () => {
    const form = taskToForm({
      title: 'T', client_id: 3, goal: 'G', expected_result: 'R',
      start_time: '2026-06-15T10:30:00', duration_minutes: 60,
    });
    expect(buildTaskPayload(form)).toMatchObject({
      title: 'T', client_id: 3, goal: 'G', expected_result: 'R',
      start_time: '2026-06-15T10:30:00', duration_minutes: 60,
    });
  });
});

describe('canComplete', () => {
  it('завершать можно только активные статусы', () => {
    expect(canComplete('pending')).toBe(true);
    expect(canComplete('in_progress')).toBe(true);
    expect(canComplete('completed')).toBe(false);
    expect(canComplete('failed')).toBe(false);
  });
});
