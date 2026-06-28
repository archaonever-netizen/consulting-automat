import { describe, expect, it } from 'vitest';
import { collectStrategyElements, findBlindZones } from './projectHypothesisCoverage';
import { NAME_KEY, type RecordState } from './ProjectFrameworkSectionCanvas';

describe('projectHypothesisCoverage', () => {
  it('collectStrategyElements убирает дубли и пустые, помечает вид', () => {
    const elements = collectStrategyElements(['Скорость', 'Скорость', ''], ['Выручка', '']);
    expect(elements).toEqual([
      { kind: 'выбор', label: 'Скорость' },
      { kind: 'результат', label: 'Выручка' },
    ]);
  });

  it('findBlindZones возвращает элементы, не покрытые ни одной гипотезой', () => {
    const elements = collectStrategyElements(['Скорость', 'Цена'], ['Выручка']);
    const records: RecordState[] = [
      { id: 1, values: { statement: 'если ускорить доставку (Скорость), то...', expectedEffect: 'рост Выручка' } },
    ];
    const blind = findBlindZones(records, elements);
    expect(blind.map(z => z.label)).toEqual(['Цена']);
  });

  it('покрытие срабатывает по названию карточки и без учёта регистра', () => {
    const elements = collectStrategyElements(['Скорость'], []);
    const records: RecordState[] = [{ id: 1, values: { [NAME_KEY]: 'Ставка на СКОРОСТЬ' } }];
    expect(findBlindZones(records, elements)).toEqual([]);
  });

  it('без гипотез все элементы — слепые зоны', () => {
    const elements = collectStrategyElements(['Скорость', 'Цена'], []);
    expect(findBlindZones([], elements)).toHaveLength(2);
  });
});
