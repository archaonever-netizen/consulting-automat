import { describe, expect, it } from 'vitest';
import { evaluateHypothesisQuality } from './projectHypothesisQuality';

const full = {
  statement: 'если предложить доставку за 2 дня, то ≥3 из 10 согласятся, потому что скорость важнее цены',
  refuteFact: '0 согласий',
  expectedEffect: 'рост выручки KR-2',
  owner: 'Иванов',
  method: 'интервью',
};

describe('evaluateHypothesisQuality', () => {
  it('красный без формулировки', () => {
    const q = evaluateHypothesisQuality({ ...full, statement: '' });
    expect(q.level).toBe('red');
    expect(q.missing.join(' ')).toContain('формулировки');
  });

  it('красный без признака опровержения (нефальсифицируемо)', () => {
    const q = evaluateHypothesisQuality({ ...full, refuteFact: '' });
    expect(q.level).toBe('red');
    expect(q.missing.join(' ')).toContain('опровергнет');
  });

  it('жёлтый: проверяема, но нет ожидаемого эффекта', () => {
    const q = evaluateHypothesisQuality({ ...full, expectedEffect: '' });
    expect(q.level).toBe('amber');
    expect(q.missing.join(' ')).toContain('эффект');
  });

  it('жёлтый: всё смысловое есть, но нет владельца', () => {
    const q = evaluateHypothesisQuality({ ...full, owner: '' });
    expect(q.level).toBe('amber');
    expect(q.missing.join(' ')).toContain('владелец');
  });

  it('зелёный: формулировка + опровержение + эффект + владелец + метод', () => {
    const q = evaluateHypothesisQuality(full);
    expect(q.level).toBe('green');
    expect(q.missing).toEqual([]);
  });

  it('пустая гипотеза — красная', () => {
    expect(evaluateHypothesisQuality({}).level).toBe('red');
  });
});
