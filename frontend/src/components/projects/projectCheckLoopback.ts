// Замыкание петли «Проверка → Гипотеза» (Этап F, CHECKS_WORKBENCH.md).
//
// Когда у проверки фиксируется ОБЪЕКТИВНЫЙ вердикт (подтверждена/опровергнута), связанная
// гипотеза получила результат — переводим её в lifecycle='результат' (стыковка с конвейером
// гипотез). Совпадение ищем по имени: поле `hypothesis` проверки хранит метку гипотезы
// (NAME_KEY либо первичное поле statement), как в пикере экрана «Проверки».
//
// Чистая функция applyVerdictToHypothesisForm тестируется без побочных эффектов; тонкая
// обёртка pushVerdictToHypotheses читает/пишет снапшот секции `hypotheses`.
import { NAME_KEY, type RecordState } from './ProjectFrameworkSectionCanvas';
import {
  readProjectFrameworkSectionSnapshot,
  writeProjectFrameworkSectionSnapshot,
} from './projectFrameworkSectionSnapshot';

const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Уже завершённые этапы конвейера — петля их не откатывает назад.
const CONCLUDED = new Set(['результат', 'закрыта']);

function hypothesisLabel(record: RecordState, primaryField: string): string {
  return record.values[NAME_KEY]?.trim() || record.values[primaryField]?.trim() || '';
}

/**
 * Проставить lifecycle='результат' записи гипотезы, чьё имя совпало с `hypothesisName`.
 * Возвращает новый список записей или null, если совпадения/изменения нет (нечего писать).
 */
export function applyVerdictToHypothesisForm(
  form: RecordState[],
  hypothesisName: string,
  primaryField: string,
): RecordState[] | null {
  const target = norm(hypothesisName);
  if (!target) return null;
  let changed = false;
  const next = form.map(record => {
    if (norm(hypothesisLabel(record, primaryField)) !== target) return record;
    if (CONCLUDED.has((record.values.lifecycle ?? '').trim().toLowerCase())) return record;
    changed = true;
    return { ...record, values: { ...record.values, lifecycle: 'результат' } };
  });
  return changed ? next : null;
}

/**
 * Перевести связанную гипотезу в «Результат» в снапшоте секции `hypotheses`.
 * Возвращает true, если запись нашлась и была изменена (и снапшот переписан).
 */
export function pushVerdictToHypotheses(projectId: number, hypothesisName: string, primaryField: string): boolean {
  const snapshot = readProjectFrameworkSectionSnapshot(projectId, 'hypotheses');
  const form = snapshot?.form;
  if (!snapshot || !Array.isArray(form)) return false;
  const next = applyVerdictToHypothesisForm(form as RecordState[], hypothesisName, primaryField);
  if (!next) return false;
  writeProjectFrameworkSectionSnapshot(projectId, 'hypotheses', {
    ...snapshot,
    form: next,
    updatedAt: new Date().toISOString(),
  });
  return true;
}
