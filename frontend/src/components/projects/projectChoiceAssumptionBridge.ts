// Мост «Стратегический выбор → реестр гипотез» (Этап 1, PROGRAMMING_INTEGRATION.md).
//
// Решение: СВЯЗАТЬ, НЕ СЛИВАЯ. «Стратегический выбор» остаётся местом для «допущений
// выбора» — его данные и связи графа не трогаем. Раздел «Программирование» — единственный
// реестр проверяемых гипотез. Допущения выбора односторонне ПРЕДЛАГАЮТСЯ в реестр как
// кандидаты (пользователь сам решает добавить), дублирующего хранилища не возникает.
//
// Это чистая логика без побочных эффектов и без UI: её можно безопасно вызывать откуда
// угодно и легко тестировать. Ничего не записывает и не меняет существующие данные.
import { NAME_KEY } from './ProjectFrameworkSectionCanvas';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';

// Лёгкое «допущение выбора», как оно лежит в lossless-форме снапшота «Стратвыбора»
// (HypothesisCard в ProjectStrategicChoiceCanvas).
export interface ChoiceAssumption {
  id: string;
  name: string;
  assumption: string;
  choiceLink: string;
  choiceLinkRef: string;
  confirms: string;
  refutes: string;
}

// Кандидат на добавление в реестр: значения уже разложены по полям карточки `hypotheses`.
export interface HypothesisCandidate {
  // id исходного допущения в «Стратвыборе» — чтобы отслеживать «уже добавлено».
  sourceId: string;
  values: Record<string, string>;
}

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Допущения выбора из lossless-формы снапшота «Стратвыбора». Пустые игнорируются. */
export function readChoiceAssumptions(projectId: number): ChoiceAssumption[] {
  const snap = readProjectStrategicChoiceSnapshot(projectId);
  const form = snap?.form as { hypotheses?: Array<Partial<ChoiceAssumption>> } | undefined;
  const list = Array.isArray(form?.hypotheses) ? form.hypotheses : [];
  return list
    .map(item => ({
      id: String(item.id ?? ''),
      name: (item.name ?? '').trim(),
      assumption: (item.assumption ?? '').trim(),
      choiceLink: (item.choiceLink ?? '').trim(),
      choiceLinkRef: (item.choiceLinkRef ?? '').trim(),
      confirms: (item.confirms ?? '').trim(),
      refutes: (item.refutes ?? '').trim(),
    }))
    // Допущение осмысленно, если есть хоть какой-то текст (имя или само предположение).
    .filter(item => item.name || item.assumption);
}

/** Отобразить допущение выбора в значения полей карточки реестра «Гипотезы». */
export function mapAssumptionToCandidateValues(assumption: ChoiceAssumption): Record<string, string> {
  return {
    [NAME_KEY]: assumption.name || assumption.assumption.slice(0, 60),
    source: 'стратегический выбор',
    statement: assumption.assumption,
    strategicChoice: assumption.choiceLink,
    confirmFact: assumption.confirms,
    refuteFact: assumption.refutes,
  };
}

// Записи реестра «Гипотезы» (lossless-форма секционного снапшота).
function readRegisterRecords(projectId: number): Array<Record<string, string>> {
  const snap = readProjectFrameworkSectionSnapshot(projectId, 'hypotheses');
  const form = snap?.form as Array<{ values?: Record<string, string> }> | undefined;
  if (!Array.isArray(form)) return [];
  return form.map(record => record?.values ?? {}).filter(values => values && typeof values === 'object');
}

// Допущение считается «уже в реестре», если совпадает текст формулировки или название карточки.
function assumptionInRegister(assumption: ChoiceAssumption, records: Array<Record<string, string>>): boolean {
  const keys = new Set([norm(assumption.assumption), norm(assumption.name)].filter(Boolean));
  if (keys.size === 0) return false;
  return records.some(values => {
    const statement = norm(values.statement ?? '');
    const cardName = norm(values[NAME_KEY] ?? '');
    return (statement && keys.has(statement)) || (cardName && keys.has(cardName));
  });
}

/**
 * Кандидаты для добавления в реестр гипотез: допущения «Стратвыбора», которых ещё нет
 * в реестре. Это «предложение», а не запись — добавляет их пользователь осознанно.
 */
export function buildHypothesisCandidates(projectId: number): HypothesisCandidate[] {
  const records = readRegisterRecords(projectId);
  return readChoiceAssumptions(projectId)
    .filter(assumption => !assumptionInRegister(assumption, records))
    .map(assumption => ({ sourceId: assumption.id, values: mapAssumptionToCandidateValues(assumption) }));
}
