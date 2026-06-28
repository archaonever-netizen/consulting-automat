// Характеризационный тест «контракта данных» гипотезы (Этап 0, PROGRAMMING_INTEGRATION.md).
//
// Зачем: новый инструмент гипотез будет читать/писать те же данные, что нынешняя форма.
// Этот тест фиксирует ИМЕНА ПОЛЕЙ гипотезы и сохранность снапшота при записи/чтении.
// Если кто-то изменит ключи полей карточки `hypotheses` или путь сохранения — тест упадёт,
// предупредив, что уже введённые клиентами данные могут осиротеть.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  NAME_KEY,
  buildSectionSnapshot,
  createConfigs,
  createRecord,
  readProjectSources,
} from './ProjectFrameworkSectionCanvas';
import {
  readProjectFrameworkSectionSnapshot,
  writeProjectFrameworkSectionSnapshot,
} from './projectFrameworkSectionSnapshot';

const PROJECT_ID = 7;

// Замороженный контракт: ключи полей карточки «Гипотезы» в текущем порядке.
// Менять этот список можно только сознательно — вместе с миграцией данных.
const FROZEN_HYPOTHESIS_FIELD_KEYS = [
  'source',
  'type',
  'statement',
  'strategicChoice',
  'mapNode',
  'expectedEffect',
  'confirmFact',
  'refuteFact',
  'dataSource',
  'method',
  'dueDate',
  'owner',
  'status',
];

function hypothesesConfig() {
  return createConfigs(readProjectSources(PROJECT_ID)).hypotheses;
}

describe('контракт данных гипотезы', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('карточка hypotheses существует и хранит ожидаемые ключи полей', () => {
    const config = hypothesesConfig();
    expect(config).toBeTruthy();
    expect(config.id).toBe('hypotheses');
    expect(config.fields.map(field => field.key)).toEqual(FROZEN_HYPOTHESIS_FIELD_KEYS);
  });

  it('первичное поле, обязательные и итоговые поля стабильны', () => {
    const config = hypothesesConfig();
    expect(config.primaryField).toBe('statement');
    expect(config.requiredFields).toEqual(
      ['source', 'type', 'statement', 'expectedEffect', 'confirmFact', 'refuteFact', 'method', 'owner'],
    );
    expect(config.summaryFields).toEqual(
      ['source', 'type', 'expectedEffect', 'confirmFact', 'refuteFact', 'method'],
    );
  });

  it('запись и чтение снапшота сохраняют значения полей без потерь', () => {
    const sources = readProjectSources(PROJECT_ID);
    const config = hypothesesConfig();
    const record = createRecord(config, sources, 1);
    record.values[NAME_KEY] = 'Заводу важна скорость';
    record.values.source = 'стратегический выбор';
    record.values.type = 'клиентская';
    record.values.statement = 'если предложить доставку за 2 дня, то ≥3 из 10 заводов согласятся на +15%';
    record.values.expectedEffect = 'рост выручки KR-2';
    record.values.confirmFact = '≥3 согласия';
    record.values.refuteFact = '0 согласий';
    record.values.method = 'интервью';
    record.values.owner = 'Иванов';

    writeProjectFrameworkSectionSnapshot(PROJECT_ID, config.id, buildSectionSnapshot(PROJECT_ID, config, sources, [record]));

    const restored = readProjectFrameworkSectionSnapshot(PROJECT_ID, 'hypotheses');
    expect(restored).toBeTruthy();
    const form = restored!.form as Array<{ id: number; values: Record<string, string> }>;
    expect(form).toHaveLength(1);
    expect(form[0].values).toMatchObject(record.values);

    // Производная выжимка для нижележащих экранов: метка и статус выводятся из полей.
    // Здесь заполнены все обязательные поля гипотезы → статус «валидно».
    expect(restored!.items[0].label).toBe('Заводу важна скорость');
    expect(restored!.items[0].status).toBe('валидно');
  });
});
