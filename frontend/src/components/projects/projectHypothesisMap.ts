// Логика «Карты допущений» (Этап 3, PROGRAMMING_INTEGRATION.md).
//
// Карта раскладывает гипотезы по двум осям: ВАЖНОСТЬ (сколько на этом держится) ×
// НЕИЗВЕСТНОСТЬ (насколько мы НЕ знаем). Угол «важно + не знаем» = проверять первым.
//
// Поля `importance` / `uncertainty` живут только в новом экране как доп. ключи значений
// гипотезы (в общий конфиг полей НЕ добавляются) — поэтому старая форма и контракт данных
// не затронуты, а значения всё равно сохраняются в lossless-форме снапшота.
import type { RecordState } from './ProjectFrameworkSectionCanvas';

export const MAP_LEVELS = ['высокая', 'средняя', 'низкая'] as const;
export type MapLevel = (typeof MAP_LEVELS)[number];

export function levelOf(value: string | undefined): MapLevel | '' {
  const normalized = (value ?? '').trim().toLowerCase();
  return (MAP_LEVELS as readonly string[]).includes(normalized) ? (normalized as MapLevel) : '';
}

export function importanceOf(record: RecordState): MapLevel | '' {
  return levelOf(record.values.importance);
}

export function uncertaintyOf(record: RecordState): MapLevel | '' {
  return levelOf(record.values.uncertainty);
}

/** Гипотеза «оценена» для карты, когда заданы обе оси. */
export function isEvaluated(record: RecordState): boolean {
  return importanceOf(record) !== '' && uncertaintyOf(record) !== '';
}

/** Верхний-левый угол: важно и при этом неизвестно — проверять первым. */
export function isTopPriority(record: RecordState): boolean {
  return importanceOf(record) === 'высокая' && uncertaintyOf(record) === 'высокая';
}

export function recordsInCell(records: RecordState[], importance: MapLevel, uncertainty: MapLevel): RecordState[] {
  return records.filter(record => importanceOf(record) === importance && uncertaintyOf(record) === uncertainty);
}

/** Гипотезы без оценки осей — их предлагаем разложить на карту. */
export function unassignedRecords(records: RecordState[]): RecordState[] {
  return records.filter(record => !isEvaluated(record));
}
