import { describe, expect, it } from 'vitest';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';

describe('PROJECT_FRAMEWORK_CARDS', () => {
  it('contains the fixed project framework cards in order', () => {
    expect(PROJECT_FRAMEWORK_CARDS).toHaveLength(14);
    expect(PROJECT_FRAMEWORK_CARDS.map(card => card.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(PROJECT_FRAMEWORK_CARDS.map(card => card.title)).toEqual([
      'Теория проекта',
      'Диагностика',
      'Стратегический выбор',
      'Целевое состояние',
      'Стратегическая карта',
      'Гипотезы',
      'Проверки',
      'Решения',
      'OKR / KPI',
      'Инициативы',
      'Бизнес-процессы',
      'Задачи',
      'Факты и обучение',
      'Весь проект',
    ]);
  });

  it('uses unique card ids', () => {
    const ids = PROJECT_FRAMEWORK_CARDS.map(card => card.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PROJECT_FRAMEWORK_CARDS[0].title).toBe('Теория проекта');
  });
});
