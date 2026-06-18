// Чистая логика форм экрана «Задачи» (без React) — покрыта тестами в logic.test.ts.

export interface TaskFormData {
  title: string;
  client_id: string; // в форме — строка из <select>, в payload — число
  goal: string;
  action_description: string;
  expected_result: string;
  preparation_notes: string;
  start_time: string; // формат input[datetime-local]: 'YYYY-MM-DDTHH:mm' или ''
  duration_minutes: string;
}

export interface TaskPayload {
  title: string;
  client_id: number;
  goal: string | null;
  action_description: string | null;
  expected_result: string | null;
  preparation_notes: string | null;
  start_time: string | null;
  duration_minutes: number | null;
}

export function emptyTaskForm(): TaskFormData {
  return {
    title: '',
    client_id: '',
    goal: '',
    action_description: '',
    expected_result: '',
    preparation_notes: '',
    start_time: '',
    duration_minutes: '',
  };
}

/** Дата из API ('2026-06-12T14:30:00') → значение для input[datetime-local].
 *  Чисто строковая операция: время хранится и показывается как есть, без
 *  пересчёта часовых поясов. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  return iso.slice(0, 16);
}

export function taskToForm(t: {
  title: string;
  client_id: number;
  goal?: string | null;
  action_description?: string | null;
  expected_result?: string | null;
  preparation_notes?: string | null;
  start_time?: string | null;
  duration_minutes?: number | null;
}): TaskFormData {
  return {
    title: t.title,
    client_id: String(t.client_id),
    goal: t.goal ?? '',
    action_description: t.action_description ?? '',
    expected_result: t.expected_result ?? '',
    preparation_notes: t.preparation_notes ?? '',
    start_time: isoToLocalInput(t.start_time),
    duration_minutes: t.duration_minutes != null ? String(t.duration_minutes) : '',
  };
}

/** Форма → payload для API. null, если обязательные поля не заполнены. */
export function buildTaskPayload(f: TaskFormData): TaskPayload | null {
  const title = f.title.trim();
  const clientId = Number(f.client_id);
  if (!title || !f.client_id || Number.isNaN(clientId)) return null;
  const duration = f.duration_minutes.trim() === '' ? null : Number(f.duration_minutes);
  return {
    title,
    client_id: clientId,
    goal: f.goal.trim() || null,
    action_description: f.action_description.trim() || null,
    expected_result: f.expected_result.trim() || null,
    preparation_notes: f.preparation_notes.trim() || null,
    start_time: f.start_time ? `${f.start_time}:00` : null,
    duration_minutes: duration != null && !Number.isNaN(duration) ? duration : null,
  };
}

/** Завершать можно только незавершённую задачу. */
export function canComplete(status: string): boolean {
  return status === 'pending' || status === 'in_progress';
}
