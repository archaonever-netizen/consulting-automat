// «Слепые зоны» карты допущений (Этап 3, доделка). Показывает, какие элементы стратегии
// не покрыты ни одной гипотезой — то, во что мы верим, не задумавшись это проверить.
//
// Покрытие определяется по тексту гипотезы: элемент считается покрытым, если его метка
// встречается в формулировке/связях/эффекте/названии хотя бы одной гипотезы. Грубое
// сопоставление по подстроке — намеренно простое и без записи данных.
import { NAME_KEY, type RecordState } from './ProjectFrameworkSectionCanvas';

export interface StrategyElement {
  kind: 'выбор' | 'результат';
  label: string;
}

/** Собрать проверяемые элементы стратегии (альтернативы выбора + результаты/KR), без дублей. */
export function collectStrategyElements(strategyChoices: string[], resultLabels: string[]): StrategyElement[] {
  const seen = new Set<string>();
  const out: StrategyElement[] = [];
  const add = (kind: StrategyElement['kind'], label: string) => {
    const trimmed = label.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push({ kind, label: trimmed });
    }
  };
  strategyChoices.forEach(label => add('выбор', label));
  resultLabels.forEach(label => add('результат', label));
  return out;
}

function hypothesisText(record: RecordState): string {
  return [
    record.values.statement,
    record.values.strategicChoice,
    record.values.mapNode,
    record.values.expectedEffect,
    record.values[NAME_KEY],
  ]
    .map(value => (value ?? '').toLowerCase())
    .join(' \n ');
}

/** Элементы стратегии, которых не касается ни одна гипотеза. */
export function findBlindZones(records: RecordState[], elements: StrategyElement[]): StrategyElement[] {
  const texts = records.map(hypothesisText);
  return elements.filter(element => {
    const needle = element.label.toLowerCase();
    return !texts.some(text => text.includes(needle));
  });
}
