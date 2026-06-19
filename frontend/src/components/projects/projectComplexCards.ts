// Реестр сложных карточек (Диагноз / Стратвыбор / Целевое состояние) для правок Методолога.
// Используется и моделью правок (projectEditModel), и применителем (projectEditApplier).
//
// Стратегия — «хирургический патч» снапшота: при правке списка-«окна» меняем и lossless-form
// (form[formKey], откуда канвас восстанавливает редактор), и соответствующую проекцию
// (snapshot[projKey], которую читает валидатор). Остальную часть снапшота не трогаем; при
// следующем открытии канвас пересоберёт проекцию точно из form (см. reloadNonce-перемонтаж).
import {
  createAlternative,
  createConsequence,
  createDiagnosis,
  createFact,
  createSymptom,
} from './ProjectDiagnosisCanvas';
import {
  createAction,
  createCapability,
  createChoice,
  createHypothesis,
  createTradeOff,
} from './ProjectStrategicChoiceCanvas';
import {
  createCapabilityTarget,
  createConstraintTarget,
  createKeyResult,
  createManagementSystemTarget,
  createOperatingModel,
  createPreserveTarget,
  createQualityTarget,
  createStakeholderValue,
  createTargetResult,
  createTargetState,
} from './ProjectTargetStateCanvas';
import {
  getFallbackProjectDiagnosisSnapshot,
  readProjectDiagnosisSnapshot,
  writeProjectDiagnosisSnapshot,
} from './projectDiagnosisSnapshot';
import {
  getFallbackProjectStrategicChoiceSnapshot,
  readProjectStrategicChoiceSnapshot,
  writeProjectStrategicChoiceSnapshot,
} from './projectStrategicChoiceSnapshot';
import {
  getFallbackProjectTargetStateSnapshot,
  readProjectTargetStateSnapshot,
  writeProjectTargetStateSnapshot,
} from './projectTargetStateSnapshot';

export type Snapshot = Record<string, unknown>;
export type FormItem = { id: number; [key: string]: unknown };

export interface ComplexScalarField {
  key: string;        // ключ в скалярном контейнере form
  label: string;      // подпись для пользователя/модели
  projKey?: string;   // ключ в проекции, если отличается от key
}

export interface ComplexListSpec {
  projKey: string;    // ключ списка в проекции (его читает валидатор)
  formKey: string;    // ключ списка в form
  title: string;      // человекочитаемое имя списка
  labelKeys: string[]; // поля-кандидаты для метки элемента
  createItem: ((id: number) => FormItem) | null; // null → добавление не поддержано
}

export interface ComplexCardSpec {
  cardId: string;
  title: string;
  read: (projectId: number) => Snapshot | null;
  write: (projectId: number, snap: Snapshot) => void;
  fallback: (projectId: number) => Snapshot;
  scalarContainer: string;               // ключ в form, где лежит объект скаляров
  createScalar: () => Record<string, unknown>;
  scalarFields: ComplexScalarField[];
  lists: ComplexListSpec[];
}

const cast = <T>(fn: (id: number) => unknown) => fn as (id: number) => T;

export const COMPLEX_CARDS: Record<string, ComplexCardSpec> = {
  diagnosis: {
    cardId: 'diagnosis',
    title: 'Диагноз',
    read: p => readProjectDiagnosisSnapshot(p) as unknown as Snapshot | null,
    write: (p, s) => writeProjectDiagnosisSnapshot(p, s as never),
    fallback: p => getFallbackProjectDiagnosisSnapshot(p) as unknown as Snapshot,
    scalarContainer: 'diagnosis',
    createScalar: () => createDiagnosis() as unknown as Record<string, unknown>,
    scalarFields: [
      { key: 'rawRequest', label: 'Сырой запрос клиента' },
      { key: 'requestType', label: 'Тип запроса' },
      { key: 'requestContext', label: 'Контекст запроса' },
      { key: 'keyChallenge', label: 'Ключевой вызов' },
      { key: 'obstacleType', label: 'Тип ключевого препятствия' },
      { key: 'limitingFactor', label: 'Ограничивающий фактор' },
      { key: 'scale', label: 'Масштаб' },
      { key: 'strategicConclusion', label: 'Вывод для стратегического выбора' },
      { key: 'exclusions', label: 'Что исключает диагноз' },
      { key: 'finalStatement', label: 'Итоговая формулировка' },
    ],
    lists: [
      { projKey: 'symptoms', formKey: 'symptoms', title: 'Симптом', labelKeys: ['description'], createItem: cast<FormItem>(createSymptom) },
      { projKey: 'facts', formKey: 'facts', title: 'Факт', labelKeys: ['indicator'], createItem: cast<FormItem>(createFact) },
      { projKey: 'alternatives', formKey: 'alternatives', title: 'Альтернативное объяснение', labelKeys: ['reason'], createItem: cast<FormItem>(createAlternative) },
      { projKey: 'consequences', formKey: 'consequences', title: 'Последствие', labelKeys: ['deterioration'], createItem: cast<FormItem>(createConsequence) },
      { projKey: 'gaps', formKey: 'gaps', title: 'Разрыв теории и реальности', labelKeys: ['gap', 'observedReality'], createItem: null },
    ],
  },

  'strategic-choice': {
    cardId: 'strategic-choice',
    title: 'Стратегический выбор',
    read: p => readProjectStrategicChoiceSnapshot(p) as unknown as Snapshot | null,
    write: (p, s) => writeProjectStrategicChoiceSnapshot(p, s as never),
    fallback: p => getFallbackProjectStrategicChoiceSnapshot(p) as unknown as Snapshot,
    scalarContainer: 'choice',
    createScalar: () => createChoice() as unknown as Record<string, unknown>,
    scalarFields: [
      { key: 'strategicQuestion', label: 'Стратегический вопрос' },
      { key: 'winningAspiration', label: 'Winning aspiration' },
      { key: 'winType', label: 'Тип победы' },
      { key: 'whereClient', label: 'Where: клиент' },
      { key: 'whereGeography', label: 'Where: география' },
      { key: 'whereProduct', label: 'Where: продукт' },
      { key: 'whereProcess', label: 'Where: процесс' },
      { key: 'whereIncluded', label: 'Where: включено' },
      { key: 'whereExcluded', label: 'Where: исключено' },
      { key: 'howApproach', label: 'How to win', projKey: 'howToWin' },
      { key: 'howDiagnosisFit', label: 'Как закрывает диагноз' },
      { key: 'howValue', label: 'Ценность' },
      { key: 'howAdvantage', label: 'Преимущество' },
      { key: 'howSystemChange', label: 'Изменение системы' },
      { key: 'howBetterThanAlternatives', label: 'Лучше альтернатив' },
      { key: 'acceptedChoice', label: 'Принятый выбор' },
      { key: 'guidingPolicy', label: 'Guiding policy' },
    ],
    lists: [
      { projKey: 'capabilities', formKey: 'capabilities', title: 'Способность', labelKeys: ['name', 'competency'], createItem: cast<FormItem>(createCapability) },
      { projKey: 'tradeOffs', formKey: 'tradeOffs', title: 'Trade-off', labelKeys: ['name', 'refusal'], createItem: cast<FormItem>(createTradeOff) },
      { projKey: 'actions', formKey: 'actions', title: 'Действие', labelKeys: ['name', 'action'], createItem: cast<FormItem>(createAction) },
      { projKey: 'hypotheses', formKey: 'hypotheses', title: 'Гипотеза', labelKeys: ['name', 'assumption'], createItem: cast<FormItem>(createHypothesis) },
    ],
  },

  'target-state': {
    cardId: 'target-state',
    title: 'Целевое состояние',
    read: p => readProjectTargetStateSnapshot(p) as unknown as Snapshot | null,
    write: (p, s) => writeProjectTargetStateSnapshot(p, s as never),
    fallback: p => getFallbackProjectTargetStateSnapshot(p) as unknown as Snapshot,
    scalarContainer: 'target',
    createScalar: () => createTargetState() as unknown as Record<string, unknown>,
    scalarFields: [
      { key: 'statement', label: 'Формулировка целевого состояния' },
      { key: 'type', label: 'Тип' },
      { key: 'objective', label: 'Objective' },
      { key: 'finalStatement', label: 'Итоговая формулировка' },
    ],
    lists: [
      { projKey: 'results', formKey: 'targetResults', title: 'Результат', labelKeys: ['name', 'criterion', 'metric'], createItem: cast<FormItem>(createTargetResult) },
      { projKey: 'stakeholderValues', formKey: 'stakeholderValues', title: 'Ценность для стейкхолдера', labelKeys: ['name', 'stakeholder'], createItem: cast<FormItem>(createStakeholderValue) },
      { projKey: 'operatingModels', formKey: 'operatingModels', title: 'Операционная модель', labelKeys: ['name', 'process'], createItem: cast<FormItem>(createOperatingModel) },
      { projKey: 'capabilities', formKey: 'capabilityTargets', title: 'Способность', labelKeys: ['name', 'competency'], createItem: cast<FormItem>(createCapabilityTarget) },
      { projKey: 'managementSystems', formKey: 'managementTargets', title: 'Система управления', labelKeys: ['name', 'systemType'], createItem: cast<FormItem>(createManagementSystemTarget) },
      { projKey: 'qualityTargets', formKey: 'qualityTargets', title: 'Цель по качеству', labelKeys: ['name', 'qualityIndicator'], createItem: cast<FormItem>(createQualityTarget) },
      { projKey: 'preserveTargets', formKey: 'preserveTargets', title: 'Что сохраняем', labelKeys: ['name', 'preserveElement'], createItem: cast<FormItem>(createPreserveTarget) },
      { projKey: 'constraints', formKey: 'constraintTargets', title: 'Ограничение', labelKeys: ['name', 'constraint'], createItem: cast<FormItem>(createConstraintTarget) },
      { projKey: 'keyResults', formKey: 'keyResults', title: 'Key result', labelKeys: ['name', 'statement'], createItem: cast<FormItem>(createKeyResult) },
    ],
  },
};

export const COMPLEX_CARD_IDS = Object.keys(COMPLEX_CARDS);

export function isComplexCard(cardId: string): boolean {
  return cardId in COMPLEX_CARDS;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : Array.isArray(v) ? v.filter(Boolean).join(', ') : '');

/** Метка элемента: первое непустое поле из labelKeys, иначе fallback. */
export function itemLabel(item: FormItem, labelKeys: string[], fallback: string): string {
  for (const k of labelKeys) {
    const v = str(item[k]);
    if (v) return v;
  }
  return fallback;
}

/** Производный элемент проекции {id,label,summary} из элемента form (generic-сборка). */
export function deriveProjItem(item: FormItem, listSpec: ComplexListSpec, index: number): { id: string; label: string; summary: string } {
  const label = itemLabel(item, listSpec.labelKeys, `${listSpec.title} ${index + 1}`);
  const summary = Object.entries(item)
    .filter(([k]) => k !== 'id' && k !== 'name')
    .map(([, v]) => str(v))
    .filter(Boolean)
    .join('; ');
  return { id: String(item.id), label, summary };
}

/** Только строковые/массивные значения элемента form — для показа модели. */
export function itemValues(item: FormItem): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(item)) {
    if (k === 'id') continue;
    const s = str(v);
    if (s) out[k] = s;
  }
  return out;
}
