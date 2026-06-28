// Жизненный цикл гипотезы и «ворота» (Этап 4, PROGRAMMING_INTEGRATION.md).
//
// Конвейер ведёт гипотезу по этапам. Главная ценность — ВОРОТА: нельзя перевести
// гипотезу в «Идёт проверка», пока не задан проверяемый дизайн (факты подтверждения/
// опровержения, метод, владелец, срок). Это и есть «контролируемость проведения».
//
// Поле `lifecycle` живёт только в новом экране (в общий конфиг не входит) — как и поля
// карты; значение сохраняется в lossless-форме снапшота, старый `status` не затрагивается.
import type { RecordState } from './ProjectFrameworkSectionCanvas';

export interface LifecycleStageDef {
  key: LifecycleStage;
  label: string;
}

export type LifecycleStage = 'черновик' | 'спроектирована' | 'идёт' | 'результат' | 'закрыта';

export const LIFECYCLE_STAGES: LifecycleStageDef[] = [
  { key: 'черновик', label: 'Черновик' },
  { key: 'спроектирована', label: 'Спроектирована' },
  { key: 'идёт', label: 'Идёт проверка' },
  { key: 'результат', label: 'Результат' },
  { key: 'закрыта', label: 'Закрыта' },
];

const STAGE_KEYS = LIFECYCLE_STAGES.map(stage => stage.key);

export function lifecycleOf(record: RecordState): LifecycleStage {
  const raw = (record.values.lifecycle ?? '').trim().toLowerCase();
  return (STAGE_KEYS as string[]).includes(raw) ? (raw as LifecycleStage) : 'черновик';
}

export function recordsInStage(records: RecordState[], stage: LifecycleStage): RecordState[] {
  return records.filter(record => lifecycleOf(record) === stage);
}

// Что нужно заполнить, чтобы войти в этап (ворота). Этапы без требований — свободный переход.
const STAGE_REQUIREMENTS: Partial<Record<LifecycleStage, Array<{ key: string; label: string }>>> = {
  спроектирована: [
    { key: 'statement', label: 'формулировка' },
    { key: 'confirmFact', label: 'факт подтверждения' },
    { key: 'refuteFact', label: 'факт опровержения' },
    { key: 'method', label: 'метод проверки' },
  ],
  идёт: [
    { key: 'statement', label: 'формулировка' },
    { key: 'confirmFact', label: 'факт подтверждения' },
    { key: 'refuteFact', label: 'факт опровержения' },
    { key: 'method', label: 'метод проверки' },
    { key: 'owner', label: 'владелец' },
    { key: 'dueDate', label: 'срок проверки' },
  ],
};

export interface GateResult {
  ok: boolean;
  missing: string[];
}

/** Проверка ворот: можно ли перевести гипотезу с такими значениями в целевой этап. */
export function gateFor(target: LifecycleStage, values: Record<string, string>): GateResult {
  const required = STAGE_REQUIREMENTS[target] ?? [];
  const missing = required.filter(field => !(values[field.key] ?? '').trim()).map(field => field.label);
  return { ok: missing.length === 0, missing };
}

/** Краткая подсказка о воротах этапа (для шапки колонки), либо null. */
export function gateHint(target: LifecycleStage): string | null {
  const required = STAGE_REQUIREMENTS[target];
  if (!required) return null;
  return `ворота: ${required.map(field => field.label).join(', ')}`;
}
