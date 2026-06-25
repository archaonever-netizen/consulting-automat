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
  createVerification,
  alternativeStatusOptions as diagAlternativeStatusOptions,
  dataSourceOptions as diagDataSourceOptions,
  obstacleTypeOptions,
  relationStatusOptions,
  reliabilityOptions,
  requestTypeOptions,
  scaleOptions,
  verificationMethodOptions,
} from './ProjectDiagnosisCanvas';
import {
  createAction,
  createAlternative as createChoiceAlternative,
  createCapability,
  createChoice,
  createHypothesis,
  createTradeOff,
  alternativeStatusOptions as choiceAlternativeStatusOptions,
  winTypeOptions,
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
  dataSourceOptions as targetDataSourceOptions,
  managementSystemOptions,
  perspectiveOptions,
  processMetricOptions,
  targetTypeOptions,
  unitOptions as targetUnitOptions,
  valueTypeOptions,
  yesNoOptions,
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
import { PROJECT_THEORY_BLOCKS, readProjectTheorySnapshot } from './projectTheorySnapshot';

export type Snapshot = Record<string, unknown>;
export type FormItem = { id: number; [key: string]: unknown };

export interface ComplexScalarField {
  key: string;        // ключ в скалярном контейнере form
  label: string;      // подпись для пользователя/модели
  projKey?: string;   // ключ в проекции, если отличается от key
  options?: string[]; // опции выпадающего списка — чтобы модель выбирала валидное значение
  // Скаляр-ссылка: динамические опции (как у refFields списков) — чтобы Методолог выбирал
  // существующий элемент, а на применении значение нормализовалось/отвергалось.
  refOptions?: (form: Record<string, unknown>, projectId: number) => string[];
  refTargetTitle?: string; // что выбираем (для просьбы «сначала добавьте …»)
}

// Поле-ссылка на элемент другого списка (выпадашка-связь). Его допустимые значения зависят от
// текущих данных проекта, поэтому считаются динамически из form (и при необходимости — из других
// карточек проекта по projectId). Нужно, чтобы Методолог выбирал СУЩЕСТВУЮЩИЙ элемент (как опции
// редактора), а на применении значение нормализовалось/отвергалось.
export interface ComplexRefField {
  field: string;                                                       // ключ поля-ссылки в элементе
  targetTitle: string;                                                 // что выбираем (для просьбы «сначала добавьте …»)
  options: (form: Record<string, unknown>, projectId: number) => string[]; // допустимые значения из текущих данных
}

export interface ComplexListSpec {
  projKey: string;    // ключ списка в проекции (его читает валидатор)
  formKey: string;    // ключ списка в form
  title: string;      // человекочитаемое имя списка
  labelKeys: string[]; // поля-кандидаты для метки элемента
  createItem: ((id: number) => FormItem) | null; // null → добавление не поддержано
  fieldOptions?: Record<string, string[]>; // ключ поля элемента → опции выпадающего списка
  refFields?: ComplexRefField[]; // поля-ссылки с динамическими опциями (связи между списками)
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

// === Динамические варианты для полей-ссылок Диагноза ===
// Повторяют опции выпадашек редактора, чтобы Методолог выбирал существующий элемент.
const DIAG_THEORY_TITLE = new Map<string, string>(PROJECT_THEORY_BLOCKS.map(b => [b.id, b.title]));
const formList = (form: Record<string, unknown>, key: string): Record<string, unknown>[] =>
  (Array.isArray(form[key]) ? (form[key] as Record<string, unknown>[]) : []);
const trimStr = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
// Имя разрыва как в редакторе: «N. <блок Теории>» (по всем разрывам — это структурные цели).
const diagGapNames = (form: Record<string, unknown>): string[] =>
  formList(form, 'gaps').map((g, i) => `${i + 1}. ${DIAG_THEORY_TITLE.get(trimStr(g.theoryBlock)) || trimStr(g.theoryBlock) || 'разрыв'}`);
// Факты/симптомы — только названные (пустая строка-заготовка не цель для связи).
const diagFactNames = (form: Record<string, unknown>): string[] =>
  formList(form, 'facts').map(f => trimStr(f.indicator)).filter(Boolean);
const diagSymptomNames = (form: Record<string, unknown>): string[] =>
  formList(form, 'symptoms').map(s => trimStr(s.description)).filter(Boolean);
const diagFactConfirmsOptions = (form: Record<string, unknown>): string[] =>
  [...diagSymptomNames(form), ...diagGapNames(form), 'Диагностическое суждение'];

// === Динамические варианты для полей-ссылок Стратегического выбора ===
// Альтернативы — цель связей «действие/гипотеза/выбор → альтернатива» (в пределах самой карточки).
// Имя совпадает с меткой элемента (labelKeys ['name','diagnosisFit']) — так граф резолвит связь по лейблу.
const choiceAlternativeNames = (form: Record<string, unknown>): string[] =>
  formList(form, 'alternatives').map(a => trimStr(a.name) || trimStr(a.diagnosisFit)).filter(Boolean);
// Компетенции Теории проекта — кросс-карточная цель связи capability → компетенция.
// Источник — производная выжимка снапшота Теории (blocks), которую читают нижележащие экраны.
const theoryCompetencyNames = (_form: Record<string, unknown>, projectId: number): string[] => {
  const block = readProjectTheorySnapshot(projectId)?.blocks?.find(b => b.id === 'competencies');
  return (block?.items ?? []).map(i => i.label.trim()).filter(Boolean);
};

// === Динамические варианты для полей-ссылок Целевого состояния ===
const theoryBlockItemNames = (projectId: number, blockId: string): string[] => {
  const block = readProjectTheorySnapshot(projectId)?.blocks?.find(b => b.id === blockId);
  return (block?.items ?? []).map(i => i.label.trim()).filter(Boolean);
};
const theoryStakeholderNames = (_form: Record<string, unknown>, projectId: number): string[] => theoryBlockItemNames(projectId, 'stakeholder');
const theoryResultNames = (_form: Record<string, unknown>, projectId: number): string[] => theoryBlockItemNames(projectId, 'results');
const theoryConstraintNames = (_form: Record<string, unknown>, projectId: number): string[] => theoryBlockItemNames(projectId, 'constraints');
const theoryQualityNames = (_form: Record<string, unknown>, projectId: number): string[] => theoryBlockItemNames(projectId, 'quality');
const theoryPreserveNames = (_form: Record<string, unknown>, projectId: number): string[] => theoryBlockItemNames(projectId, 'preserve');
const theoryResultOrQualityNames = (form: Record<string, unknown>, projectId: number): string[] =>
  [...theoryResultNames(form, projectId), ...theoryQualityNames(form, projectId)];
const strategyCapabilityNames = (_form: Record<string, unknown>, projectId: number): string[] =>
  (readProjectStrategicChoiceSnapshot(projectId)?.capabilities ?? []).map(i => i.label.trim()).filter(Boolean);
const targetCapabilityNames = (form: Record<string, unknown>, projectId: number): string[] =>
  [...theoryCompetencyNames(form, projectId), ...strategyCapabilityNames(form, projectId)];
const targetStrategyChoiceNames = (_form: Record<string, unknown>, projectId: number): string[] => {
  const strategy = readProjectStrategicChoiceSnapshot(projectId);
  return [
    strategy?.whereToPlay,
    strategy?.howToWin,
    ...(strategy?.capabilities ?? []).map(i => i.label),
  ].map(v => v?.trim()).filter(Boolean) as string[];
};

export const COMPLEX_CARDS: Record<string, ComplexCardSpec> = {
  diagnosis: {
    cardId: 'diagnosis',
    title: 'Диагностика',
    read: p => readProjectDiagnosisSnapshot(p) as unknown as Snapshot | null,
    write: (p, s) => writeProjectDiagnosisSnapshot(p, s as never),
    fallback: p => getFallbackProjectDiagnosisSnapshot(p) as unknown as Snapshot,
    scalarContainer: 'diagnosis',
    createScalar: () => createDiagnosis() as unknown as Record<string, unknown>,
    scalarFields: [
      { key: 'rawRequest', label: 'Сырой запрос клиента' },
      { key: 'requestType', label: 'Тип запроса', options: requestTypeOptions },
      { key: 'requestContext', label: 'Контекст запроса' },
      { key: 'keyChallenge', label: 'Ключевой вызов' },
      { key: 'obstacleType', label: 'Тип ключевого препятствия', options: obstacleTypeOptions },
      { key: 'limitingFactor', label: 'Ограничивающий фактор' },
      { key: 'scale', label: 'Масштаб', options: scaleOptions },
      { key: 'strategicConclusion', label: 'Вывод для стратегического выбора' },
      { key: 'exclusions', label: 'Что исключает диагноз' },
      { key: 'finalStatement', label: 'Итоговая формулировка' },
    ],
    lists: [
      { projKey: 'symptoms', formKey: 'symptoms', title: 'Симптом', labelKeys: ['description'], createItem: cast<FormItem>(createSymptom), fieldOptions: { dataSource: diagDataSourceOptions }, refFields: [{ field: 'relatedGap', targetTitle: 'разрыв теории и реальности', options: diagGapNames }] },
      { projKey: 'facts', formKey: 'facts', title: 'Факт', labelKeys: ['indicator'], createItem: cast<FormItem>(createFact), fieldOptions: { dataSource: diagDataSourceOptions, reliability: reliabilityOptions }, refFields: [{ field: 'confirms', targetTitle: 'симптом, разрыв или «Диагностическое суждение»', options: diagFactConfirmsOptions }] },
      { projKey: 'alternatives', formKey: 'alternatives', title: 'Альтернативное объяснение', labelKeys: ['reason'], createItem: cast<FormItem>(createAlternative), fieldOptions: { status: diagAlternativeStatusOptions }, refFields: [{ field: 'confirms', targetTitle: 'факт', options: diagFactNames }, { field: 'refutes', targetTitle: 'факт', options: diagFactNames }] },
      { projKey: 'consequences', formKey: 'consequences', title: 'Последствие', labelKeys: ['deterioration'], createItem: cast<FormItem>(createConsequence), fieldOptions: { source: diagDataSourceOptions } },
      { projKey: 'gaps', formKey: 'gaps', title: 'Разрыв теории и реальности', labelKeys: ['gap', 'observedReality'], createItem: null, fieldOptions: { status: relationStatusOptions }, refFields: [{ field: 'confirmingFact', targetTitle: 'факт', options: diagFactNames }] },
      { projKey: 'verifications', formKey: 'verifications', title: 'Проверка диагноза', labelKeys: ['subject'], createItem: cast<FormItem>(createVerification), fieldOptions: { method: verificationMethodOptions } },
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
      { key: 'winningAspiration', label: 'Что считаем победой' },
      { key: 'winType', label: 'Тип победы', options: winTypeOptions },
      { key: 'whereClient', label: 'Где конкурируем: клиент' },
      { key: 'whereGeography', label: 'Где конкурируем: география' },
      { key: 'whereProduct', label: 'Где конкурируем: продукт' },
      { key: 'whereProcess', label: 'Где конкурируем: процесс' },
      { key: 'whereIncluded', label: 'Где конкурируем: включено' },
      { key: 'whereExcluded', label: 'Где конкурируем: исключено' },
      { key: 'howApproach', label: 'Как выигрываем', projKey: 'howToWin' },
      { key: 'howDiagnosisFit', label: 'Как закрывает диагноз' },
      { key: 'howValue', label: 'Ценность' },
      { key: 'howAdvantage', label: 'Преимущество' },
      { key: 'howSystemChange', label: 'Изменение системы' },
      { key: 'howBetterThanAlternatives', label: 'Лучше альтернатив' },
      { key: 'selectedAlternative', label: 'Выбранная альтернатива', refOptions: choiceAlternativeNames, refTargetTitle: 'стратегическая альтернатива' },
      { key: 'acceptedChoice', label: 'Принятый выбор' },
      { key: 'guidingPolicy', label: 'Направляющая политика' },
      { key: 'managementMetrics', label: 'Системы управления: метрики' },
      { key: 'managementRhythm', label: 'Системы управления: управленческий ритм' },
      { key: 'decisionOwners', label: 'Системы управления: владельцы решений' },
      { key: 'reporting', label: 'Системы управления: отчётность' },
      { key: 'controlProcess', label: 'Системы управления: процесс контроля' },
      { key: 'dataSystem', label: 'Системы управления: данные' },
      { key: 'resourceAllocation', label: 'Системы управления: распределение ресурсов' },
      { key: 'reviewMechanism', label: 'Системы управления: механизм пересмотра' },
      { key: 'noActionWhatHappens', label: 'Если ничего не делать: что произойдёт' },
      { key: 'noActionMissedResult', label: 'Если ничего не делать: какой результат не достигается' },
      { key: 'noActionAffected', label: 'Если ничего не делать: кого затронет' },
      { key: 'noActionVerdict', label: 'Если ничего не делать: вывод' },
    ],
    lists: [
      { projKey: 'capabilities', formKey: 'capabilities', title: 'Способность', labelKeys: ['name', 'competency'], createItem: cast<FormItem>(createCapability), refFields: [{ field: 'competency', targetTitle: 'ключевая компетенция (Теория проекта)', options: theoryCompetencyNames }] },
      { projKey: 'alternatives', formKey: 'alternatives', title: 'Стратегическая альтернатива', labelKeys: ['name', 'diagnosisFit'], createItem: cast<FormItem>(createChoiceAlternative), fieldOptions: { status: choiceAlternativeStatusOptions } },
      { projKey: 'tradeOffs', formKey: 'tradeOffs', title: 'Компромисс', labelKeys: ['name', 'refusal'], createItem: cast<FormItem>(createTradeOff) },
      { projKey: 'actions', formKey: 'actions', title: 'Действие', labelKeys: ['name', 'action'], createItem: cast<FormItem>(createAction), refFields: [{ field: 'supportsChoice', targetTitle: 'стратегическая альтернатива', options: choiceAlternativeNames }] },
      { projKey: 'hypotheses', formKey: 'hypotheses', title: 'Гипотеза', labelKeys: ['name', 'assumption'], createItem: cast<FormItem>(createHypothesis), refFields: [{ field: 'choiceLink', targetTitle: 'стратегическая альтернатива', options: choiceAlternativeNames }] },
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
      { key: 'type', label: 'Тип', options: targetTypeOptions },
      { key: 'whereClient', label: 'Где конкурируем: клиент / сегмент', refOptions: theoryStakeholderNames, refTargetTitle: 'клиент / выгодоприобретатель (Теория проекта)' },
      { key: 'whereGeography', label: 'Где конкурируем: география' },
      { key: 'whereProduct', label: 'Где конкурируем: продукт / услуга / функция' },
      { key: 'whereProcess', label: 'Где конкурируем: процесс' },
      { key: 'whereExcluded', label: 'Где конкурируем: что исключаем' },
      { key: 'howApproach', label: 'Как выигрываем: выбранный способ' },
      { key: 'howValue', label: 'Как выигрываем: ценность для клиента' },
      { key: 'howAdvantage', label: 'Как выигрываем: за счёт чего преимущество' },
      { key: 'howObstacle', label: 'Как выигрываем: какое препятствие снимает' },
      { key: 'howBetter', label: 'Как выигрываем: чем лучше альтернатив' },
      { key: 'objective', label: 'Цель (Objective)' },
      { key: 'finalStatement', label: 'Итоговая формулировка' },
    ],
    lists: [
      { projKey: 'results', formKey: 'targetResults', title: 'Результат', labelKeys: ['name', 'criterion', 'metric'], createItem: cast<FormItem>(createTargetResult), fieldOptions: { perspective: perspectiveOptions, unit: targetUnitOptions, controlSource: targetDataSourceOptions }, refFields: [{ field: 'criterion', targetTitle: 'критерий результата (Теория проекта)', options: theoryResultNames }] },
      { projKey: 'stakeholderValues', formKey: 'stakeholderValues', title: 'Ценность для стейкхолдера', labelKeys: ['name', 'stakeholder'], createItem: cast<FormItem>(createStakeholderValue), fieldOptions: { valueType: valueTypeOptions }, refFields: [{ field: 'stakeholder', targetTitle: 'клиент / выгодоприобретатель (Теория проекта)', options: theoryStakeholderNames }, { field: 'measurement', targetTitle: 'критерий результата или показатель качества', options: theoryResultOrQualityNames }] },
      { projKey: 'operatingModels', formKey: 'operatingModels', title: 'Операционная модель', labelKeys: ['name', 'process'], createItem: cast<FormItem>(createOperatingModel), fieldOptions: { metric: processMetricOptions, controlSource: targetDataSourceOptions } },
      { projKey: 'capabilities', formKey: 'capabilityTargets', title: 'Способность', labelKeys: ['name', 'competency'], createItem: cast<FormItem>(createCapabilityTarget), refFields: [{ field: 'competency', targetTitle: 'компетенция Теории или способность Стратегического выбора', options: targetCapabilityNames }] },
      { projKey: 'managementSystems', formKey: 'managementTargets', title: 'Система управления', labelKeys: ['name', 'systemType'], createItem: cast<FormItem>(createManagementSystemTarget), fieldOptions: { systemType: managementSystemOptions, dataSource: targetDataSourceOptions }, refFields: [{ field: 'supportsChoice', targetTitle: 'элемент Стратегического выбора', options: targetStrategyChoiceNames }] },
      { projKey: 'qualityTargets', formKey: 'qualityTargets', title: 'Цель по качеству', labelKeys: ['name', 'qualityIndicator'], createItem: cast<FormItem>(createQualityTarget), fieldOptions: { controlSource: targetDataSourceOptions }, refFields: [{ field: 'qualityIndicator', targetTitle: 'показатель качества (Теория проекта)', options: theoryQualityNames }] },
      { projKey: 'preserveTargets', formKey: 'preserveTargets', title: 'Что сохраняем', labelKeys: ['name', 'preserveElement'], createItem: cast<FormItem>(createPreserveTarget), refFields: [{ field: 'preserveElement', targetTitle: 'сохраняемое ядро (Теория проекта)', options: theoryPreserveNames }] },
      // Таблица «Что изменится / что сохранится» — 8 фиксированных областей (createItem: null,
      // как у diagnosis.gaps): методолог заполняет change/preserve у существующих строк, новых не плодит.
      { projKey: 'comparisonRows', formKey: 'comparisonRows', title: 'Что изменится / что сохранится', labelKeys: ['area'], createItem: null },
      { projKey: 'constraints', formKey: 'constraintTargets', title: 'Ограничение', labelKeys: ['name', 'constraint'], createItem: cast<FormItem>(createConstraintTarget), fieldOptions: { controlSource: targetDataSourceOptions }, refFields: [{ field: 'constraint', targetTitle: 'ограничение (Теория проекта)', options: theoryConstraintNames }] },
      { projKey: 'keyResults', formKey: 'keyResults', title: 'Ключевой результат', labelKeys: ['name', 'statement'], createItem: cast<FormItem>(createKeyResult), fieldOptions: { controlSource: targetDataSourceOptions, indisputable: yesNoOptions }, refFields: [{ field: 'metric', targetTitle: 'критерий результата (Теория проекта)', options: theoryResultNames }] },
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

// Русские метки полей элементов сложных карточек. Ключи — общие на все списки (поле
// `name` всюду «Название» и т.п.); этого достаточно, чтобы модель знала ВСЕ поля элемента
// и заполняла его целиком, а не только видимое непустое поле. Метка лишь подсказывает —
// если ключа здесь нет, отдаём сам ключ.
export const COMPLEX_FIELD_LABELS: Record<string, string> = {
  // общие
  name: 'Название', status: 'Статус', owner: 'Ответственный', deadline: 'Срок',
  dataSource: 'Источник данных', controlSource: 'Источник контроля',
  metric: 'Метрика / показатель', target: 'Целевое значение', baseline: 'Базовое значение',
  unit: 'Единица измерения', minimum: 'Минимально допустимо', reason: 'Причина',
  gap: 'Разрыв', affected: 'Кого затрагивает', confirms: 'Что подтверждает',
  refutes: 'Что опровергает', change: 'Изменение', competency: 'Компетенция',
  currentLevel: 'Текущий уровень', requiredLevel: 'Требуемый уровень',
  supportsChoice: 'Как поддерживает стратегический выбор',
  // Диагноз: симптомы
  description: 'Описание симптома', location: 'Где проявляется', frequency: 'Частота / масштаб',
  relatedGap: 'Связанный разрыв',
  // Диагноз: факты
  indicator: 'Показатель / наблюдение', value: 'Значение', period: 'Период',
  reliability: 'Надёжность источника',
  // Диагноз: последствия
  deterioration: 'Что ухудшится', timing: 'Срок наступления', damage: 'Возможный ущерб',
  source: 'Источник оценки',
  // Диагноз: разрывы (gaps)
  theoryBlock: 'Блок теории проекта', expectedState: 'Ожидаемое состояние',
  observedReality: 'Наблюдаемая реальность', confirmingFact: 'Подтверждающий факт',
  // Диагноз: проверка диагноза (verifications)
  subject: 'Что проверяем', method: 'Метод проверки',
  confirmFact: 'Факт, подтверждающий диагноз', refuteFact: 'Факт, опровергающий диагноз',
  // Стратвыбор: способности
  strengthen: 'Как усилить', external: 'Что взять извне',
  // Стратвыбор: стратегические альтернативы
  diagnosisFit: 'Как закрывает диагноз', whereToPlay: 'Где конкурируем', howToWin: 'Как выигрываем',
  capabilities: 'Необходимые способности', managementSystems: 'Системы управления',
  resourceCommitments: 'Ресурсные обязательства', constraints: 'Ограничения',
  preserveRisk: 'Риск для сохраняемого ядра', whatNotToDo: 'Что нельзя делать',
  // Стратвыбор: trade-off
  refusal: 'От чего отказываемся', releasedResource: 'Высвобождаемый ресурс',
  reducedRisk: 'Снижаемый риск', approver: 'Кто утверждает',
  // Стратвыбор: действия
  action: 'Действие', resource: 'Необходимый ресурс', dependency: 'Зависимость',
  futureLink: 'Связь с будущим',
  // Стратвыбор: гипотезы
  assumption: 'Предположение', choiceLink: 'Связь со стратегическим выбором',
  // Целевое: результаты
  criterion: 'Критерий успеха', perspective: 'Перспектива (BSC)',
  // Целевое: ценности стейкхолдеров
  stakeholder: 'Стейкхолдер', valueType: 'Тип ценности', measurement: 'Как измеряем',
  // Целевое: операционные модели
  process: 'Процесс', targetWork: 'Как должно работать',
  // Целевое: способности
  developmentAction: 'Действие по развитию',
  // Целевое: системы управления
  systemType: 'Тип системы управления',
  // Целевое: качество
  qualityIndicator: 'Показатель качества', deviationAction: 'Действие при отклонении',
  // Целевое: сохранить
  preserveElement: 'Что сохраняем', targetLook: 'Как должно выглядеть',
  forbiddenChange: 'Что нельзя менять',
  // Целевое: что изменится / сохранится (таблица сравнения)
  area: 'Область сравнения', preserve: 'Что сохранится',
  // Целевое: ограничения
  constraint: 'Ограничение', compliance: 'Требование соответствия', limit: 'Предел',
  violationConsequence: 'Последствие нарушения',
  // Целевое: key results
  statement: 'Формулировка', indisputable: 'Бесспорный признак достижения',
};

export interface ComplexFieldSchema { key: string; label: string; options?: string[] }

/** Полная схема полей элемента списка: ключи берём из фабрики createItem (или из union
 * ключей существующих элементов, если фабрики нет), метки — из COMPLEX_FIELD_LABELS,
 * опции выпадающих списков — из listSpec.fieldOptions (чтобы модель выбирала валидное значение).
 * Нужна модели Методолога, чтобы заполнять элемент ЦЕЛИКОМ, а не только видимые поля. */
export function listItemFields(listSpec: ComplexListSpec, items: FormItem[], form?: Record<string, unknown>, projectId = 0): ComplexFieldSchema[] {
  let keys: string[];
  if (listSpec.createItem) {
    keys = Object.keys(listSpec.createItem(0)).filter(k => k !== 'id');
  } else {
    const set = new Set<string>();
    for (const it of items) for (const k of Object.keys(it)) if (k !== 'id') set.add(k);
    keys = [...set];
  }
  // Динамические опции полей-ссылок (варианты зависят от текущих данных проекта; иногда — из других карточек по projectId).
  const refOpts = new Map<string, string[]>();
  if (form && listSpec.refFields) {
    for (const rf of listSpec.refFields) {
      refOpts.set(rf.field, rf.options(form, projectId));
      if (!keys.includes(rf.field)) keys.push(rf.field);
    }
  }
  return keys.map(key => {
    const options = refOpts.get(key) ?? listSpec.fieldOptions?.[key];
    return { key, label: COMPLEX_FIELD_LABELS[key] ?? key, ...(options && options.length ? { options } : {}) };
  });
}

/** Сопоставить присланное значение поля-ссылки с допустимым вариантом: точное → без регистра →
 *  однозначное частичное вхождение. Возвращает канонический вариант или null. */
export function resolveRefOption(options: string[], raw: unknown): string | null {
  const t = (typeof raw === 'string' ? raw : String(raw ?? '')).trim();
  if (!t) return null;
  const exact = options.find(o => o === t) ?? options.find(o => o.toLowerCase() === t.toLowerCase());
  if (exact) return exact;
  if (t.length >= 3) {
    const hits = options.filter(o => o.toLowerCase().includes(t.toLowerCase()));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

export interface RefMiss { field: string; targetTitle: string; text: string; }

/** Нормализовать поля-ссылки в values по текущему form: валидные → канонический вариант;
 *  невалидные убираем из values (чтобы не записать «битую» связь) и копим в missing.
 *  Пустую строку трактуем как очистку связи — оставляем как есть. */
export function normalizeRefFields(
  listSpec: ComplexListSpec,
  form: Record<string, unknown>,
  values: Record<string, unknown> | undefined,
  projectId = 0,
): { values: Record<string, unknown> | undefined; missing: RefMiss[] } {
  if (!values || !listSpec.refFields?.length) return { values, missing: [] };
  const out = { ...values };
  const missing: RefMiss[] = [];
  for (const rf of listSpec.refFields) {
    if (!(rf.field in out)) continue;
    const raw = out[rf.field];
    if (raw == null || String(raw).trim() === '') continue;
    const canon = resolveRefOption(rf.options(form, projectId), raw);
    if (canon) out[rf.field] = canon;
    else { delete out[rf.field]; missing.push({ field: rf.field, targetTitle: rf.targetTitle, text: String(raw).trim() }); }
  }
  return { values: out, missing };
}

/** Просьба дозаполнить недостающие цели связей (вместо записи битого значения). */
export function refMissingMessage(missing: RefMiss[]): string {
  const uniq = Array.from(new Set(missing.map(m => `«${m.text}» (${m.targetTitle})`)));
  return `Не нашёл цель для связи: ${uniq.join(', ')}. Сначала добавьте/назовите этот элемент, затем повторите привязку.`;
}
