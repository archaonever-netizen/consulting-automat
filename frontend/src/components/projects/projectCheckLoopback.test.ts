import { describe, expect, it } from 'vitest';
import { applyVerdictToHypothesisForm } from './projectCheckLoopback';
import { NAME_KEY, type RecordState } from './ProjectFrameworkSectionCanvas';

const PRIMARY = 'statement';

function form(): RecordState[] {
  return [
    { id: 1, values: { [NAME_KEY]: 'Скорость важна', lifecycle: 'идёт' } },
    { id: 2, values: { statement: 'если доставка за 2 дня, то ≥3 согласятся' } },
  ];
}

describe('projectCheckLoopback.applyVerdictToHypothesisForm', () => {
  it('переводит совпавшую по имени (NAME_KEY) гипотезу в результат', () => {
    const next = applyVerdictToHypothesisForm(form(), 'Скорость важна', PRIMARY);
    expect(next).not.toBeNull();
    expect(next![0].values.lifecycle).toBe('результат');
    expect(next![1].values.lifecycle).toBeUndefined(); // вторую не трогаем
  });

  it('совпадение по первичному полю (statement), когда нет имени', () => {
    const next = applyVerdictToHypothesisForm(form(), 'если доставка за 2 дня, то ≥3 согласятся', PRIMARY);
    expect(next![1].values.lifecycle).toBe('результат');
  });

  it('сопоставление нечувствительно к регистру и лишним пробелам', () => {
    const next = applyVerdictToHypothesisForm(form(), '  скорость   ВАЖНА ', PRIMARY);
    expect(next).not.toBeNull();
    expect(next![0].values.lifecycle).toBe('результат');
  });

  it('нет совпадения → null (ничего не пишем)', () => {
    expect(applyVerdictToHypothesisForm(form(), 'Неизвестная гипотеза', PRIMARY)).toBeNull();
    expect(applyVerdictToHypothesisForm(form(), '', PRIMARY)).toBeNull();
  });

  it('уже завершённую гипотезу (результат/закрыта) не откатывает', () => {
    const done: RecordState[] = [{ id: 1, values: { [NAME_KEY]: 'A', lifecycle: 'результат' } }];
    expect(applyVerdictToHypothesisForm(done, 'A', PRIMARY)).toBeNull();
    const closed: RecordState[] = [{ id: 1, values: { [NAME_KEY]: 'A', lifecycle: 'закрыта' } }];
    expect(applyVerdictToHypothesisForm(closed, 'A', PRIMARY)).toBeNull();
  });
});
