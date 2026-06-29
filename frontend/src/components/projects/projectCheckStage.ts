// Этапы проверки гипотезы и ворота вердикта (Этап A инструмента «Проверки», CHECKS_WORKBENCH).
//
// «Проверка» (карточка секции `experiments`) ведёт одну гипотезу через этапы:
//   Дизайн → Сбор свидетельств → Оценка → Вердикт → Следствие.
// Главная ценность — ОБЪЕКТИВНОСТЬ вердикта: «подтверждена/опровергнута» нельзя поставить,
// пока критерий не задан ЗАРАНЕЕ (пороги), не собрано хотя бы одно свидетельство и нет
// измеренного значения для сверки с порогом. Это зеркало «ворот» конвейера гипотез
// (projectHypothesisLifecycle) — тот же приём, но для исполнения проверки.
//
// Поле `stage` живёт изолированно в lossless-снапшоте секции `experiments` (как `lifecycle`
// у гипотез); вердикт — это существующее поле `result`. Чистая логика без побочных эффектов.
import type { RecordState } from './ProjectFrameworkSectionCanvas';
import { evidenceOf, summarizeEvidence } from './projectCheckEvidence';

export type CheckStage = 'дизайн' | 'сбор' | 'оценка' | 'вердикт' | 'следствие';

export interface CheckStageDef {
  key: CheckStage;
  label: string;
}

export const CHECK_STAGES: CheckStageDef[] = [
  { key: 'дизайн', label: 'Дизайн' },
  { key: 'сбор', label: 'Сбор свидетельств' },
  { key: 'оценка', label: 'Оценка' },
  { key: 'вердикт', label: 'Вердикт' },
  { key: 'следствие', label: 'Следствие' },
];

const STAGE_KEYS = CHECK_STAGES.map(stage => stage.key);

export function stageOf(record: RecordState): CheckStage {
  const raw = (record.values.stage ?? '').trim().toLowerCase();
  return (STAGE_KEYS as string[]).includes(raw) ? (raw as CheckStage) : 'дизайн';
}

export function recordsInStage(records: RecordState[], stage: CheckStage): RecordState[] {
  return records.filter(record => stageOf(record) === stage);
}

// Вердикт = существующее поле `result` карточки проверки.
export type Verdict = 'подтверждена' | 'опровергнута' | 'недостаточно данных';
export const VERDICTS: Verdict[] = ['подтверждена', 'опровергнута', 'недостаточно данных'];

export function verdictOf(record: RecordState): Verdict | null {
  const raw = (record.values.result ?? '').trim();
  return (VERDICTS as string[]).includes(raw) ? (raw as Verdict) : null;
}

/** Цвет огонька проверки в списках/доске: подтверждена → green, опровергнута → red, иначе → amber. */
export function checkStatusLevel(record: RecordState): 'green' | 'amber' | 'red' {
  const verdict = verdictOf(record);
  if (verdict === 'подтверждена') return 'green';
  if (verdict === 'опровергнута') return 'red';
  return 'amber';
}

function has(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export interface GateResult {
  ok: boolean;
  missing: string[];
}

// Требование входа в этап: человекочитаемая метка + предикат по значениям проверки.
interface CheckRequirement {
  label: string;
  ok: (values: Record<string, string>) => boolean;
}

const need = (key: string, label: string): CheckRequirement => ({ label, ok: values => has(values[key]) });

// «Дизайн готов»: критерий проверки задан ЗАРАНЕЕ — это фундамент объективности.
const DESIGN: CheckRequirement[] = [
  need('hypothesis', 'проверяемая гипотеза'),
  need('subject', 'что проверяем'),
  need('method', 'метод проверки'),
  need('metric', 'проверяемая метрика'),
  need('confirmThreshold', 'порог подтверждения'),
  need('refuteThreshold', 'порог опровержения'),
];

const hasEvidence: CheckRequirement = {
  label: 'хотя бы одно свидетельство',
  ok: values => evidenceOf(values).length > 0,
};

const hasMeasured: CheckRequirement = {
  label: 'измеренное значение в свидетельстве',
  ok: values => summarizeEvidence(evidenceOf(values)).measured > 0,
};

const hasVerdict: CheckRequirement = {
  label: 'зафиксированный вердикт',
  ok: values => (VERDICTS as string[]).includes((values.result ?? '').trim()),
};

// Ворота на ВХОД в этап (накопительно, как в конвейере гипотез). «Дизайн» — старт, без ворот.
const STAGE_REQUIREMENTS: Partial<Record<CheckStage, CheckRequirement[]>> = {
  сбор: [...DESIGN],
  оценка: [...DESIGN, hasEvidence],
  вердикт: [...DESIGN, hasEvidence, hasMeasured],
  следствие: [...DESIGN, hasEvidence, hasMeasured, hasVerdict],
};

/** Ворота этапа: можно ли перевести проверку с такими значениями в целевой этап. */
export function gateFor(target: CheckStage, values: Record<string, string>): GateResult {
  const required = STAGE_REQUIREMENTS[target] ?? [];
  const missing = required.filter(req => !req.ok(values)).map(req => req.label);
  return { ok: missing.length === 0, missing };
}

/** Краткая подсказка о воротах этапа (для шапки колонки доски), либо null. */
export function gateHint(target: CheckStage): string | null {
  const required = STAGE_REQUIREMENTS[target];
  if (!required) return null;
  return `ворота: ${required.map(req => req.label).join(', ')}`;
}

// Ворота ОБЪЕКТИВНОГО вердикта: «подтверждена/опровергнута» доступны, только если критерий
// задан заранее, собрано свидетельство и есть измерение для сверки. Иначе — лишь
// «недостаточно данных». Это и есть «подтверждать/опровергать объективно».
const VERDICT_REQUIREMENTS: CheckRequirement[] = [
  {
    label: 'критерий задан заранее (порог подтверждения или опровержения)',
    ok: values => has(values.confirmThreshold) || has(values.refuteThreshold),
  },
  hasEvidence,
  hasMeasured,
];

/** Ворота вердикта: чего не хватает, чтобы выносить объективный вердикт. */
export function verdictGate(values: Record<string, string>): GateResult {
  const missing = VERDICT_REQUIREMENTS.filter(req => !req.ok(values)).map(req => req.label);
  return { ok: missing.length === 0, missing };
}

/** Можно ли вынести объективный вердикт (подтверждена/опровергнута). */
export function canConcludeVerdict(values: Record<string, string>): boolean {
  return verdictGate(values).ok;
}

/**
 * Подсказка вердикта по собранным свидетельствам (НЕ авто-фиксация — решает человек):
 *  • ворота закрыты → «недостаточно данных»;
 *  • перевес «за» → «подтверждена», перевес «против» → «опровергнута»;
 *  • поровну → «недостаточно данных».
 */
export function suggestVerdict(values: Record<string, string>): Verdict {
  if (!canConcludeVerdict(values)) return 'недостаточно данных';
  const summary = summarizeEvidence(evidenceOf(values));
  if (summary.for > summary.against) return 'подтверждена';
  if (summary.against > summary.for) return 'опровергнута';
  return 'недостаточно данных';
}
