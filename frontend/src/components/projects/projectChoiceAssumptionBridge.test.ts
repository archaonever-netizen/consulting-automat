import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildHypothesisCandidates,
  mapAssumptionToCandidateValues,
  readChoiceAssumptions,
  type ChoiceAssumption,
} from './projectChoiceAssumptionBridge';
import { NAME_KEY } from './ProjectFrameworkSectionCanvas';
import {
  getFallbackProjectStrategicChoiceSnapshot,
  writeProjectStrategicChoiceSnapshot,
} from './projectStrategicChoiceSnapshot';
import { writeProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';

const PROJECT_ID = 11;

function assumption(over: Partial<ChoiceAssumption>): ChoiceAssumption {
  return { id: '1', name: '', assumption: '', choiceLink: '', choiceLinkRef: '', confirms: '', refutes: '', ...over };
}

function seedChoiceHypotheses(hypotheses: ChoiceAssumption[]) {
  const snap = getFallbackProjectStrategicChoiceSnapshot(PROJECT_ID);
  snap.form = { choice: {}, capabilities: [], alternatives: [], tradeOffs: [], actions: [], hypotheses };
  writeProjectStrategicChoiceSnapshot(PROJECT_ID, snap);
}

function seedRegister(records: Array<{ id: number; values: Record<string, string> }>) {
  writeProjectFrameworkSectionSnapshot(PROJECT_ID, 'hypotheses', {
    projectId: PROJECT_ID,
    sectionId: 'hypotheses',
    title: 'Гипотезы',
    updatedAt: '',
    items: [],
    completedChecks: 0,
    totalChecks: 0,
    form: records,
  });
}

describe('мост Стратвыбор → реестр гипотез', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('читает заполненные допущения выбора и пропускает пустые', () => {
    seedChoiceHypotheses([
      assumption({ id: '1', name: 'Скорость важна', assumption: 'заводу важна доставка за 2 дня' }),
      assumption({ id: '2' }), // пустое — игнорируется
    ]);
    const result = readChoiceAssumptions(PROJECT_ID);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Скорость важна');
  });

  it('возвращает пустой список, когда снапшота выбора нет', () => {
    expect(readChoiceAssumptions(PROJECT_ID)).toEqual([]);
    expect(buildHypothesisCandidates(PROJECT_ID)).toEqual([]);
  });

  it('отображает допущение в поля карточки реестра', () => {
    const values = mapAssumptionToCandidateValues(
      assumption({
        name: 'Скорость важна',
        assumption: 'заводу важна доставка за 2 дня',
        choiceLink: 'выигрываем скоростью',
        confirms: '≥3 согласия',
        refutes: '0 согласий',
      }),
    );
    expect(values[NAME_KEY]).toBe('Скорость важна');
    expect(values.source).toBe('стратегический выбор');
    expect(values.statement).toBe('заводу важна доставка за 2 дня');
    expect(values.strategicChoice).toBe('выигрываем скоростью');
    expect(values.confirmFact).toBe('≥3 согласия');
    expect(values.refuteFact).toBe('0 согласий');
  });

  it('предлагает в кандидаты только допущения, которых ещё нет в реестре', () => {
    seedChoiceHypotheses([
      assumption({ id: '1', name: 'A', assumption: 'предположение A' }),
      assumption({ id: '2', name: 'B', assumption: 'предположение B' }),
    ]);
    // В реестре уже есть «предположение A» (по тексту формулировки).
    seedRegister([{ id: 1, values: { [NAME_KEY]: 'другое имя', statement: 'Предположение A' } }]);

    const candidates = buildHypothesisCandidates(PROJECT_ID);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sourceId).toBe('2');
    expect(candidates[0].values.statement).toBe('предположение B');
  });

  it('сопоставляет дубль и по названию карточки, не только по формулировке', () => {
    seedChoiceHypotheses([assumption({ id: '1', name: 'Скорость важна', assumption: 'текст' })]);
    seedRegister([{ id: 1, values: { [NAME_KEY]: 'Скорость важна', statement: '' } }]);
    expect(buildHypothesisCandidates(PROJECT_ID)).toHaveLength(0);
  });
});
