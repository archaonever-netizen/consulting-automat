import { describe, expect, it } from 'vitest';
import {
  buildTaskPayload,
  canComplete,
  emptyTaskForm,
  isoToLocalInput,
  taskToForm,
} from './logic';

describe('buildTaskPayload', () => {
  it('builds payload, trims strings and converts empty fields to null', () => {
    const p = buildTaskPayload({
      title: '  Call client  ',
      client_id: '7',
      goal: '',
      action_description: '  ',
      expected_result: 'Meeting scheduled',
      preparation_notes: '  Prepare agenda  ',
      start_time: '2026-06-15T10:30',
      duration_minutes: '45',
    });
    expect(p).toEqual({
      title: 'Call client',
      client_id: 7,
      goal: null,
      action_description: null,
      expected_result: 'Meeting scheduled',
      preparation_notes: 'Prepare agenda',
      start_time: '2026-06-15T10:30:00',
      duration_minutes: 45,
    });
  });

  it('returns null without title or client', () => {
    expect(buildTaskPayload({ ...emptyTaskForm(), client_id: '1' })).toBeNull();
    expect(buildTaskPayload({ ...emptyTaskForm(), title: 'x' })).toBeNull();
  });

  it('empty date and duration become null', () => {
    const p = buildTaskPayload({ ...emptyTaskForm(), title: 'x', client_id: '1' });
    expect(p?.start_time).toBeNull();
    expect(p?.duration_minutes).toBeNull();
  });

  it('non-numeric duration does not break payload', () => {
    const p = buildTaskPayload({
      ...emptyTaskForm(), title: 'x', client_id: '1', duration_minutes: 'abc',
    });
    expect(p?.duration_minutes).toBeNull();
  });
});

describe('taskToForm / isoToLocalInput', () => {
  it('trims API date to datetime-local format without timezone shift', () => {
    expect(isoToLocalInput('2026-06-15T10:30:00')).toBe('2026-06-15T10:30');
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput(undefined)).toBe('');
  });

  it('task becomes a form with defaults for empty fields', () => {
    const f = taskToForm({ title: 'T', client_id: 3, goal: null, start_time: '2026-06-15T10:30:00' });
    expect(f.title).toBe('T');
    expect(f.client_id).toBe('3');
    expect(f.goal).toBe('');
    expect(f.preparation_notes).toBe('');
    expect(f.start_time).toBe('2026-06-15T10:30');
    expect(f.duration_minutes).toBe('');
  });

  it('task form round-trips to payload without data loss', () => {
    const form = taskToForm({
      title: 'T',
      client_id: 3,
      goal: 'G',
      expected_result: 'R',
      preparation_notes: 'P',
      start_time: '2026-06-15T10:30:00',
      duration_minutes: 60,
    });
    expect(buildTaskPayload(form)).toMatchObject({
      title: 'T',
      client_id: 3,
      goal: 'G',
      expected_result: 'R',
      preparation_notes: 'P',
      start_time: '2026-06-15T10:30:00',
      duration_minutes: 60,
    });
  });
});

describe('canComplete', () => {
  it('allows completing only active statuses', () => {
    expect(canComplete('pending')).toBe(true);
    expect(canComplete('in_progress')).toBe(true);
    expect(canComplete('completed')).toBe(false);
    expect(canComplete('failed')).toBe(false);
  });
});
