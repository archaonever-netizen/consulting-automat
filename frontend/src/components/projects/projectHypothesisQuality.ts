// «Огонёк качества» гипотезы (Этап 2, PROGRAMMING_INTEGRATION.md).
//
// Локальная мгновенная оценка: хорошая ли это гипотеза — без обращения к серверу.
// Смысл: гипотеза осмысленна и проверяема, когда она одновременно
//   • сформулирована (есть «если → то → потому что»),
//   • фальсифицируема (указано, что её ОПРОВЕРГНЕТ — иначе это лозунг),
//   • привязана к результату (указан ожидаемый эффект — на что влияет).
// Зелёный требует ещё владельца и метода проверки (иначе её нельзя вести).
//
// Это чистая логика без побочных эффектов. Позже поверх можно наложить разбор
// ИИ-Методолога, но базовый огонёк работает мгновенно и оффлайн.

export type HypothesisQualityLevel = 'green' | 'amber' | 'red';

export interface HypothesisQuality {
  level: HypothesisQualityLevel;
  // Человекочитаемые подсказки, чего не хватает (для красного/жёлтого).
  missing: string[];
}

function has(value: string | undefined): boolean {
  return Boolean(value && value.trim());
}

export function evaluateHypothesisQuality(values: Record<string, string>): HypothesisQuality {
  const hasStatement = has(values.statement);
  const hasRefute = has(values.refuteFact);
  const hasEffect = has(values.expectedEffect);

  // Смысловые подсказки.
  const meaningMissing: string[] = [];
  if (!hasStatement) meaningMissing.push('нет формулировки «если → то → потому что»');
  if (!hasRefute) meaningMissing.push('не указано, что её опровергнет — нечем проверить');
  if (!hasEffect) meaningMissing.push('не указан ожидаемый эффект — на какой результат влияет');

  // Эксплуатационные подсказки (нужны для зелёного, но сами по себе не делают красным).
  const opsMissing: string[] = [];
  if (!has(values.owner)) opsMissing.push('не назначен владелец');
  if (!has(values.method)) opsMissing.push('не выбран метод проверки');

  // Красный: без формулировки или без опровержения гипотезу нельзя проверить.
  if (!hasStatement || !hasRefute) {
    return { level: 'red', missing: meaningMissing };
  }
  // Зелёный: все три смысловых критерия + владелец + метод.
  if (hasEffect && opsMissing.length === 0) {
    return { level: 'green', missing: [] };
  }
  // Жёлтый: проверяема, но ещё не дотягивает до «хорошей».
  return { level: 'amber', missing: [...meaningMissing, ...opsMissing] };
}

export const QUALITY_LABEL: Record<HypothesisQualityLevel, string> = {
  green: 'готова к проверке',
  amber: 'дорабатывается',
  red: 'это пока лозунг',
};
