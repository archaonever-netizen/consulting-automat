// Адаптер «Теории проекта» (project-theory) для ИИ-Методолога — по образцу projectComplexCards.
// Теория структурно особая: одна singleton-карточка «Миссия» (скаляры) + 6 списков, чьи
// элементы вложены в blocks по типам, а проекция blocks[].items/expectedState собирается
// мапперами-сумматорами с кросс-ссылками. Поэтому здесь:
//   • buildTheoryEditable — карта карточки для модели с ОПЦИЯМИ выпадающих списков (включая
//     зависимые/каскадные и ссылочные), чтобы Методолог выбирал валидные значения, а не текст;
//   • applyTheoryEdit — «хирургический патч» lossless-form + пересборка проекции через
//     экспортированную из канваса buildTheorySnapshotBlocks (одна точка истины с живым редактором).
import {
  buildTheorySnapshotBlocks,
  createCompetencyCard,
  createConstraintCard,
  createCriterion,
  createMissionCard,
  createPreserveElementCard,
  createQualityIndicatorCard,
  createStakeholderCard,
  getConstraintNames,
  getConstraintSubtypeOptions,
  getPreserveIndicatorOptions,
  getQualityControlSourceOptions,
  getQualityDefectOptions,
  getQualityMetricOptions,
  getResultMetricOptions,
  getSelectedResultMetric,
  getStakeholderTypeOptions,
  getStakeholderValueOptions,
  refLabel,
  // статические опции
  competencyActionOptions,
  competencyAreaOptions,
  competencyCurrentLevelOptions,
  competencyDataSourceOptions,
  competencyHolderOptions,
  competencyProcessActivityOptions,
  competencyRequiredLevelOptions,
  competencyRoleOptions,
  competencyStrategicChoiceOptions,
  competencySupportSystemOptions,
  competencyTypeOptions,
  competencyVerificationOptions,
  constraintControlFrequencyOptions,
  constraintControlSourceOptions,
  constraintDirectionOptions,
  constraintRigidityOptions,
  constraintScopeOptions,
  constraintTypeOptions,
  constraintUnitOptions,
  constraintViolationOptions,
  measurementFrequencyOptions,
  methodologyCheckOptions,
  missionExternalChangeOptions,
  missionLevelOptions,
  missionNotOptions,
  missionReviewOptions,
  missionTypeOptions,
  missionValueForOptions,
  missionValueOptions,
  normDirectionOptions,
  preserveChangeableOptions,
  preserveControlFrequencyOptions,
  preserveControlSourceOptions,
  preserveCoreReasonOptions,
  preserveElementTypeOptions,
  preserveForbiddenActionOptions,
  preserveNormDirectionOptions,
  preserveThreatActionOptions,
  preserveUnitOptions,
  qualityDeviationActions,
  qualityDirections,
  qualityFrequencies,
  qualityObjectOptions,
  qualityRoleOptions,
  qualityUnits,
  resultBeneficiaryOptions,
  resultControlSourceFallback,
  resultPerspectiveOptions,
  resultRoleOptions,
  resultUnitOptions,
  stakeholderDataSourceOptions,
  stakeholderInfluenceOptions,
  stakeholderPriorityOptions,
  stakeholderRelationMetricOptions,
  stakeholderRiskOptions,
  stakeholderRoleOptions,
  stakeholderSegmentOptions,
  stakeholderValuePropositionOptions,
  stakeholderVerificationOptions,
  strategicGoalOptions,
  type MissionCard,
  type RefOption,
  type ResultCriterion,
  type TheoryForm,
} from './ProjectTheoryCanvas';
import { itemLabel, type FormItem } from './projectComplexCards';
import { mergeItemValues, pickIndex } from './projectEditShared';
import {
  getFallbackProjectTheorySnapshot,
  readProjectTheorySnapshot,
  writeProjectTheorySnapshot,
} from './projectTheorySnapshot';
import type { EditableCard, EditableFieldSchema, EditableItem, EditableList, EditableScalarField } from './projectEditModel';
import type { ApplyResult } from './projectEditApplier';
import type { Proposal } from './projectReview';

export const THEORY_CARD_ID = 'project-theory';

export function isTheoryCard(cardId: string): boolean {
  return cardId === THEORY_CARD_ID;
}

// === Описание полей ===

type RefKind = 'stakeholders' | 'criteria' | 'competencies' | 'preserve' | 'constraints' | 'protections';
type OptionProvider = string[] | ((form: TheoryForm, item: Record<string, unknown>) => string[]);

interface TheoryFieldSpec {
  key: string;
  label: string;
  options?: OptionProvider;   // статические или зависимые опции (для не-ссылочных полей)
  ref?: RefKind;              // кросс-ссылка: опции = лейблы связанных карточек, патч резолвит лейбл→id
}

interface TheoryBlockSpec {
  list: string;                  // id блока — его модель присылает как proposal.list
  title: string;
  formKey: keyof TheoryForm;     // массив элементов в form
  nextIdKey: keyof TheoryForm;   // счётчик id в form
  createItem: (id: number) => FormItem;
  labelKeys: string[];
  fields: TheoryFieldSpec[];
}

const factory = <T>(fn: (id: number) => T) => fn as unknown as (id: number) => FormItem;
const metricNames = (perspective: string) => getResultMetricOptions(perspective).map(option => option.name);
const resultSources = (_form: TheoryForm, item: Record<string, unknown>) =>
  getSelectedResultMetric(item as unknown as ResultCriterion)?.sources || resultControlSourceFallback;

const MISSION_FIELDS: TheoryFieldSpec[] = [
  { key: 'level', label: 'Уровень миссии', options: missionLevelOptions },
  { key: 'mainBeneficiary', label: 'Главный выгодоприобретатель', ref: 'stakeholders' },
  { key: 'valueFor', label: 'Ценность для кого', options: missionValueForOptions },
  { key: 'problem', label: 'Проблема / потребность' },
  { key: 'value', label: 'Ценность', options: missionValueOptions },
  { key: 'valueOther', label: 'Ценность (своя формулировка)' },
  { key: 'missionType', label: 'Тип миссии', options: missionTypeOptions },
  { key: 'deeperReason', label: 'Более глубокая причина' },
  { key: 'victoryState', label: 'Состояние победы' },
  { key: 'externalChanges', label: 'Внешние изменения', options: missionExternalChangeOptions },
  { key: 'externalChangeOther', label: 'Внешнее изменение (своё)' },
  { key: 'assumption', label: 'Ключевое допущение' },
  { key: 'relatedCompetencies', label: 'Связанные компетенции', ref: 'competencies' },
  { key: 'relatedResults', label: 'Связанные результаты', ref: 'criteria' },
  { key: 'notMission', label: 'Что НЕ является миссией', options: missionNotOptions },
  { key: 'notMissionOther', label: 'Что НЕ миссия (своё)' },
  { key: 'protectRelations', label: 'Что нельзя нарушить', ref: 'protections' },
  { key: 'reviewRule', label: 'Правило пересмотра миссии', options: missionReviewOptions },
  { key: 'finalStatement', label: 'Итоговая формулировка миссии' },
];

const STAKEHOLDER_FIELDS: TheoryFieldSpec[] = [
  { key: 'role', label: 'Роль', options: stakeholderRoleOptions },
  { key: 'type', label: 'Тип', options: (_f, it) => getStakeholderTypeOptions(String(it.role ?? '')) },
  { key: 'details', label: 'Кто именно (детализация)' },
  { key: 'segment', label: 'Сегмент', options: stakeholderSegmentOptions },
  { key: 'segmentOther', label: 'Сегмент (свой)' },
  { key: 'need', label: 'Потребность' },
  { key: 'value', label: 'Ценность', options: (_f, it) => getStakeholderValueOptions(String(it.type ?? '')) },
  { key: 'valueProposition', label: 'Ценностное предложение', options: stakeholderValuePropositionOptions },
  { key: 'resultCriterion', label: 'Связанный критерий результата', ref: 'criteria' },
  { key: 'relationMetric', label: 'Метрика отношений', options: stakeholderRelationMetricOptions },
  { key: 'influence', label: 'Влияние', options: stakeholderInfluenceOptions },
  { key: 'priority', label: 'Приоритет', options: stakeholderPriorityOptions },
  { key: 'definitionRisk', label: 'Риск определения', options: stakeholderRiskOptions },
  { key: 'verificationMethod', label: 'Метод проверки', options: stakeholderVerificationOptions },
  { key: 'dataSource', label: 'Источник данных', options: stakeholderDataSourceOptions },
];

const RESULT_FIELDS: TheoryFieldSpec[] = [
  { key: 'statement', label: 'Формулировка результата' },
  { key: 'perspective', label: 'Перспектива (BSC)', options: resultPerspectiveOptions },
  { key: 'strategicGoal', label: 'Стратегическая цель', options: strategicGoalOptions },
  { key: 'role', label: 'Роль результата', options: resultRoleOptions },
  { key: 'beneficiary', label: 'Выгодоприобретатель', options: resultBeneficiaryOptions },
  { key: 'beneficiaryOther', label: 'Выгодоприобретатель (свой)' },
  { key: 'metric', label: 'Метрика результата', options: (_f, it) => metricNames(String(it.perspective ?? '')) },
  { key: 'currentValue', label: 'Базовое значение' },
  { key: 'targetValue', label: 'Целевое значение' },
  { key: 'formula', label: 'Формула расчёта' },
  { key: 'unit', label: 'Единица измерения', options: resultUnitOptions },
  { key: 'normDirection', label: 'Направление нормы', options: normDirectionOptions },
  { key: 'deadline', label: 'Срок достижения (дата)' },
  { key: 'measurementFrequency', label: 'Частота измерения', options: measurementFrequencyOptions },
  { key: 'controlSource', label: 'Источник контроля', options: resultSources },
  { key: 'acceptor', label: 'Приёмщик' },
  { key: 'owner', label: 'Владелец результата' },
  { key: 'methodologyChecks', label: 'Методологические проверки', options: methodologyCheckOptions },
  { key: 'requiredCompetencies', label: 'Требуемые компетенции', ref: 'competencies' },
];

const COMPETENCY_FIELDS: TheoryFieldSpec[] = [
  { key: 'name', label: 'Название компетенции' },
  { key: 'type', label: 'Тип', options: competencyTypeOptions },
  { key: 'area', label: 'Область', options: competencyAreaOptions },
  { key: 'strategicChoice', label: 'Связь со стратегическим выбором', options: competencyStrategicChoiceOptions },
  { key: 'role', label: 'Роль компетенции', options: competencyRoleOptions },
  { key: 'holder', label: 'Носитель', options: competencyHolderOptions },
  { key: 'holderDetails', label: 'Носитель (детали)' },
  { key: 'resultCriterion', label: 'Связанный критерий результата', ref: 'criteria' },
  { key: 'processActivity', label: 'Процесс / деятельность', options: competencyProcessActivityOptions },
  { key: 'currentLevel', label: 'Текущий уровень', options: competencyCurrentLevelOptions },
  { key: 'requiredLevel', label: 'Требуемый уровень', options: competencyRequiredLevelOptions },
  { key: 'verificationMethod', label: 'Метод проверки', options: competencyVerificationOptions },
  { key: 'confirmationMetric', label: 'Подтверждающая метрика' },
  { key: 'dataSource', label: 'Источник данных', options: competencyDataSourceOptions },
  { key: 'action', label: 'Действие по развитию', options: competencyActionOptions },
  { key: 'supportSystems', label: 'Системы поддержки', options: competencySupportSystemOptions },
  { key: 'owner', label: 'Владелец' },
  { key: 'targetDate', label: 'Целевая дата' },
];

const CONSTRAINT_FIELDS: TheoryFieldSpec[] = [
  { key: 'type', label: 'Тип ограничения', options: constraintTypeOptions },
  { key: 'subtype', label: 'Подтип', options: (_f, it) => getConstraintSubtypeOptions(String(it.type ?? '')) },
  { key: 'statement', label: 'Формулировка ограничения' },
  { key: 'rigidity', label: 'Жёсткость', options: constraintRigidityOptions },
  { key: 'limit', label: 'Предел / значение' },
  { key: 'unit', label: 'Единица измерения', options: constraintUnitOptions },
  { key: 'direction', label: 'Направление', options: constraintDirectionOptions },
  { key: 'scope', label: 'Область действия', options: constraintScopeOptions },
  { key: 'resultCriterion', label: 'Связанный критерий результата', ref: 'criteria' },
  { key: 'hypothesis', label: 'Гипотеза' },
  { key: 'violationConsequence', label: 'Последствие нарушения', options: constraintViolationOptions },
  { key: 'owner', label: 'Владелец' },
  { key: 'changeAuthority', label: 'Кто вправе менять' },
  { key: 'controlSource', label: 'Источник контроля', options: constraintControlSourceOptions },
  { key: 'controlFrequency', label: 'Частота контроля', options: constraintControlFrequencyOptions },
];

const QUALITY_FIELDS: TheoryFieldSpec[] = [
  { key: 'role', label: 'Роль', options: qualityRoleOptions },
  { key: 'object', label: 'Объект качества', options: qualityObjectOptions },
  { key: 'requirement', label: 'Требование' },
  { key: 'defects', label: 'Дефекты', options: (_f, it) => getQualityDefectOptions(String(it.object ?? '')) },
  { key: 'metric', label: 'Метрика', options: (_f, it) => getQualityMetricOptions(String(it.object ?? ''), Array.isArray(it.defects) ? (it.defects as string[]) : []) },
  { key: 'formula', label: 'Формула' },
  { key: 'currentValue', label: 'Текущее значение' },
  { key: 'minimumValue', label: 'Минимально допустимо' },
  { key: 'targetValue', label: 'Целевое значение' },
  { key: 'unit', label: 'Единица измерения', options: qualityUnits },
  { key: 'normDirection', label: 'Направление нормы', options: qualityDirections },
  { key: 'controlSource', label: 'Источник контроля', options: (_f, it) => getQualityControlSourceOptions(String(it.object ?? '')) },
  { key: 'controlFrequency', label: 'Частота контроля', options: qualityFrequencies },
  { key: 'owner', label: 'Владелец' },
  { key: 'acceptor', label: 'Приёмщик' },
  { key: 'resultCriterion', label: 'Связанный критерий результата', ref: 'criteria' },
  { key: 'beneficiary', label: 'Выгодоприобретатель', ref: 'stakeholders' },
  { key: 'process', label: 'Процесс', options: competencyProcessActivityOptions },
  { key: 'deviationAction', label: 'Действие при отклонении', options: qualityDeviationActions },
];

const PRESERVE_FIELDS: TheoryFieldSpec[] = [
  { key: 'type', label: 'Тип сохраняемого элемента', options: preserveElementTypeOptions },
  { key: 'details', label: 'Детализация' },
  { key: 'coreReason', label: 'Почему это ядро', options: preserveCoreReasonOptions },
  { key: 'changeableItems', label: 'Что вокруг можно менять', options: preserveChangeableOptions },
  { key: 'forbiddenActions', label: 'Запрещённые действия', options: preserveForbiddenActionOptions },
  { key: 'forbiddenActionOther', label: 'Запрещённое действие (своё)' },
  { key: 'stakeholder', label: 'Связанный стейкхолдер', ref: 'stakeholders' },
  { key: 'resultCriterion', label: 'Связанный критерий результата', ref: 'criteria' },
  { key: 'constraint', label: 'Связанное ограничение', ref: 'constraints' },
  { key: 'preservationIndicator', label: 'Индикатор сохранности', options: (_f, it) => getPreserveIndicatorOptions(String(it.type ?? '')) },
  { key: 'minimumValue', label: 'Минимальное значение' },
  { key: 'unit', label: 'Единица измерения', options: preserveUnitOptions },
  { key: 'normDirection', label: 'Направление нормы', options: preserveNormDirectionOptions },
  { key: 'controlSource', label: 'Источник контроля', options: preserveControlSourceOptions },
  { key: 'controlFrequency', label: 'Частота контроля', options: preserveControlFrequencyOptions },
  { key: 'owner', label: 'Владелец' },
  { key: 'acceptor', label: 'Приёмщик' },
  { key: 'threatAction', label: 'Действие при угрозе', options: preserveThreatActionOptions },
];

const THEORY_BLOCKS: TheoryBlockSpec[] = [
  { list: 'stakeholder', title: 'Клиент / выгодоприобретатель', formKey: 'stakeholders', nextIdKey: 'nextStakeholderId', createItem: factory(createStakeholderCard), labelKeys: ['details', 'role'], fields: STAKEHOLDER_FIELDS },
  { list: 'results', title: 'Критерии результата', formKey: 'criteria', nextIdKey: 'nextCriterionId', createItem: factory(createCriterion), labelKeys: ['statement'], fields: RESULT_FIELDS },
  { list: 'competencies', title: 'Ключевые компетенции', formKey: 'competencies', nextIdKey: 'nextCompetencyId', createItem: factory(createCompetencyCard), labelKeys: ['name'], fields: COMPETENCY_FIELDS },
  { list: 'constraints', title: 'Ограничения', formKey: 'constraints', nextIdKey: 'nextConstraintId', createItem: factory(createConstraintCard), labelKeys: ['statement', 'subtype'], fields: CONSTRAINT_FIELDS },
  { list: 'quality', title: 'Качество', formKey: 'qualityIndicators', nextIdKey: 'nextQualityIndicatorId', createItem: factory(createQualityIndicatorCard), labelKeys: ['requirement', 'metric', 'object'], fields: QUALITY_FIELDS },
  { list: 'preserve', title: 'Что нельзя разрушить', formKey: 'preserveElements', nextIdKey: 'nextPreserveElementId', createItem: factory(createPreserveElementCard), labelKeys: ['details', 'type'], fields: PRESERVE_FIELDS },
];

// === Form: чтение, нормализация, запись ===

type Refs = Record<RefKind, RefOption[]>;

function defaultTheoryForm(): TheoryForm {
  return {
    mission: createMissionCard(),
    stakeholders: [createStakeholderCard(1)], nextStakeholderId: 2,
    criteria: [createCriterion(1)], nextCriterionId: 2,
    competencies: [createCompetencyCard(1)], nextCompetencyId: 2,
    constraints: [createConstraintCard(1)], nextConstraintId: 2,
    qualityIndicators: [createQualityIndicatorCard(1)], nextQualityIndicatorId: 2,
    preserveElements: [createPreserveElementCard(1)], nextPreserveElementId: 2,
  };
}

function normalizeForm(raw: Partial<TheoryForm> | undefined): TheoryForm {
  const base = defaultTheoryForm();
  if (!raw || typeof raw !== 'object') return base;
  const arr = <T>(v: unknown, fallback: T[]): T[] => (Array.isArray(v) ? (v as T[]) : fallback);
  const num = (v: unknown, fallback: number): number => (typeof v === 'number' ? v : fallback);
  return {
    mission: raw.mission && typeof raw.mission === 'object' ? { ...base.mission, ...raw.mission } : base.mission,
    stakeholders: arr(raw.stakeholders, base.stakeholders),
    nextStakeholderId: num(raw.nextStakeholderId, base.nextStakeholderId),
    criteria: arr(raw.criteria, base.criteria),
    nextCriterionId: num(raw.nextCriterionId, base.nextCriterionId),
    competencies: arr(raw.competencies, base.competencies),
    nextCompetencyId: num(raw.nextCompetencyId, base.nextCompetencyId),
    constraints: arr(raw.constraints, base.constraints),
    nextConstraintId: num(raw.nextConstraintId, base.nextConstraintId),
    qualityIndicators: arr(raw.qualityIndicators, base.qualityIndicators),
    nextQualityIndicatorId: num(raw.nextQualityIndicatorId, base.nextQualityIndicatorId),
    preserveElements: arr(raw.preserveElements, base.preserveElements),
    nextPreserveElementId: num(raw.nextPreserveElementId, base.nextPreserveElementId),
  };
}

function readTheoryForm(projectId: number): TheoryForm {
  const snap = readProjectTheorySnapshot(projectId) ?? getFallbackProjectTheorySnapshot(projectId);
  return normalizeForm(snap.form as Partial<TheoryForm> | undefined);
}

function writeForm(projectId: number, form: TheoryForm) {
  writeProjectTheorySnapshot(projectId, {
    projectId,
    updatedAt: new Date().toISOString(),
    blocks: buildTheorySnapshotBlocks(form),
    form,
  });
}

function buildRefs(form: TheoryForm): Refs {
  const stakeholders = form.stakeholders.map((s, i) => ({ value: String(s.id), label: s.details.trim() || s.role.trim() || `Стейкхолдер ${i + 1}` }));
  const criteria = form.criteria.map((c, i) => ({ value: String(c.id), label: c.statement.trim() || `Критерий результата ${i + 1}` }));
  const competencies = form.competencies.map((c, i) => ({ value: String(c.id), label: c.name.trim() || `Компетенция ${i + 1}` }));
  const preserveNames = form.preserveElements.map((e, i) => e.details.trim() || e.type.trim() || `Сохраняемый элемент ${i + 1}`);
  const preserve = form.preserveElements.map((e, i) => ({ value: String(e.id), label: preserveNames[i] }));
  const constraintNames = getConstraintNames(form.constraints);
  const constraints = form.constraints.map((c, i) => ({ value: String(c.id), label: constraintNames[i] }));
  const protections = [
    ...preserve.map(o => ({ value: `pe:${o.value}`, label: o.label })),
    ...constraints.map(o => ({ value: `c:${o.value}`, label: o.label })),
  ];
  return { stakeholders, criteria, competencies, preserve, constraints, protections };
}

// === Значения/опции полей ===

const unique = (values: string[]): string[] => Array.from(new Set(values.filter(Boolean)));

function splitMulti(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean);
  return String(v ?? '').split(/[;,]\s*/).map(s => s.trim()).filter(Boolean);
}

function evalOptions(provider: OptionProvider, form: TheoryForm, item: Record<string, unknown>): string[] {
  return typeof provider === 'function' ? provider(form, item) : provider;
}

/** Резолвит присланное моделью значение ссылочного поля (лейбл/часть лейбла/уже-id) → id карточки. */
function resolveRefValues(options: RefOption[], raw: unknown, multi: boolean): string[] {
  const tokens = multi ? splitMulti(raw) : [String(raw ?? '').trim()];
  const out: string[] = [];
  for (const token of tokens) {
    const t = token.trim();
    if (!t) continue;
    let opt = options.find(o => o.value === t);
    if (!opt) opt = options.find(o => o.label.trim().toLowerCase() === t.toLowerCase());
    if (!opt && t.length >= 3) opt = options.find(o => o.label.toLowerCase().includes(t.toLowerCase()));
    out.push(opt ? opt.value : t);
  }
  return out;
}

/** Записать значение в поле объекта (миссия или элемент списка): ссылки → id, массивы → split. */
function applyFieldValue(target: Record<string, unknown>, field: TheoryFieldSpec, raw: unknown, refs: Refs) {
  const isArr = Array.isArray(target[field.key]);
  if (field.ref) {
    const ids = resolveRefValues(refs[field.ref], raw, isArr);
    target[field.key] = isArr ? ids : (ids[0] ?? '');
  } else if (isArr) {
    target[field.key] = splitMulti(raw);
  } else {
    target[field.key] = raw == null ? '' : String(raw);
  }
}

/** Свести присланные значения в объект по схеме полей. Возвращает число применённых полей. */
function applyValues(target: Record<string, unknown>, fields: TheoryFieldSpec[], values: Record<string, unknown> | undefined, refs: Refs): number {
  if (!values) return 0;
  const byKey = new Map(fields.map(f => [f.key, f]));
  const byLabel = new Map(fields.map(f => [f.label.trim().toLowerCase(), f]));
  let touched = 0;
  for (const [k, v] of Object.entries(values)) {
    if (k === 'id') continue;
    const field = byKey.get(k) ?? byLabel.get(k.trim().toLowerCase());
    if (field) {
      applyFieldValue(target, field, v, refs);
      touched += 1;
    } else if (k in target) {
      // ключ есть в элементе, но не в схеме — применяем как обычное значение через общий хелпер
      mergeItemValues(target as FormItem, { [k]: v });
      touched += 1;
    }
  }
  return touched;
}

/** Человекочитаемое значение поля для показа модели: ссылки → лейблы, массивы → join. */
function displayValue(target: Record<string, unknown>, field: TheoryFieldSpec, refs: Refs): string {
  const v = target[field.key];
  if (field.ref) {
    const opts = refs[field.ref];
    if (Array.isArray(v)) return v.map(x => refLabel(opts, String(x))).filter(Boolean).join('; ');
    return refLabel(opts, String(v ?? ''));
  }
  if (Array.isArray(v)) return v.map(String).filter(Boolean).join('; ');
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

function fieldSchemaOptions(field: TheoryFieldSpec, form: TheoryForm, refs: Refs, items: Record<string, unknown>[]): string[] {
  if (field.ref) return unique(refs[field.ref].map(o => o.label));
  if (!field.options) return [];
  const source = items.length ? items : [{}];
  return unique(source.flatMap(it => evalOptions(field.options!, form, it)));
}

// === Карта карточки для модели ===

export function buildTheoryEditable(projectId: number): EditableCard {
  const form = readTheoryForm(projectId);
  const refs = buildRefs(form);
  const mission = form.mission as unknown as Record<string, unknown>;

  const fields: EditableScalarField[] = MISSION_FIELDS.map(field => {
    const out: EditableScalarField = { key: field.key, label: field.label, value: displayValue(mission, field, refs) };
    const opts = fieldSchemaOptions(field, form, refs, [mission]);
    if (opts.length) out.options = opts;
    return out;
  });

  const lists: EditableList[] = THEORY_BLOCKS.map(block => {
    const items = form[block.formKey] as unknown as FormItem[];
    const records = items.map(it => it as unknown as Record<string, unknown>);
    const item_fields: EditableFieldSchema[] = block.fields.map(field => {
      const schema: EditableFieldSchema = { key: field.key, label: field.label };
      const opts = fieldSchemaOptions(field, form, refs, records);
      if (opts.length) schema.options = opts;
      return schema;
    });
    const editableItems: EditableItem[] = items.map((item, index) => {
      const record = item as unknown as Record<string, unknown>;
      const values: Record<string, string> = {};
      for (const field of block.fields) {
        const d = displayValue(record, field, refs);
        if (d && d.trim()) values[field.key] = d;
      }
      return { id: String(item.id), label: itemLabel(item, block.labelKeys, `${block.title} ${index + 1}`), values };
    });
    return { list: block.list, title: block.title, item_fields, items: editableItems };
  });

  return { card_id: THEORY_CARD_ID, title: 'Теория проекта', fields, lists };
}

// === Применение правок ===

const fail = (message: string): ApplyResult => ({ ok: false, message });
const succeed = (message: string): ApplyResult => ({ ok: true, message });

function nextItemId(arr: FormItem[]): number {
  return arr.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1;
}

function resolveBlock(name: string | undefined): TheoryBlockSpec | undefined {
  const lc = (name ?? '').trim().toLowerCase();
  if (!lc) return undefined;
  return THEORY_BLOCKS.find(b =>
    b.list.toLowerCase() === lc || String(b.formKey).toLowerCase() === lc || b.title.toLowerCase() === lc);
}

function inferBlockByValues(values: Record<string, unknown> | undefined): TheoryBlockSpec | undefined {
  const keys = Object.keys(values || {});
  if (!keys.length) return undefined;
  let best: TheoryBlockSpec | undefined;
  let bestScore = 0;
  for (const block of THEORY_BLOCKS) {
    const fieldKeys = new Set(block.fields.map(f => f.key));
    const score = keys.filter(k => fieldKeys.has(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = block;
    }
  }
  return bestScore > 0 ? best : undefined;
}

function inferBlockByItemId(form: TheoryForm, itemId: unknown): TheoryBlockSpec | undefined {
  const raw = (itemId ?? '').toString().trim();
  if (!raw) return undefined;
  for (const block of THEORY_BLOCKS) {
    const arr = form[block.formKey] as unknown as FormItem[];
    if (arr.some(i => String(i.id) === raw)) return block;
  }
  return undefined;
}

const MISSION_LIST_ALIASES = new Set(['mission', 'миссия', 'миссия проекта']);

function applyMission(projectId: number, form: TheoryForm, refs: Refs, proposal: Proposal): ApplyResult {
  const mission = { ...(form.mission as unknown as Record<string, unknown>) };
  const values = proposal.op === 'update_field'
    ? (proposal.field ? { [proposal.field]: proposal.value } : undefined)
    : proposal.values;
  if (proposal.op === 'update_field' && !proposal.field) return fail('Не указано поле миссии.');
  const touched = applyValues(mission, MISSION_FIELDS, values, refs);
  if (!touched) return fail('Не распознаны поля миссии для изменения.');
  form.mission = mission as unknown as MissionCard;
  writeForm(projectId, form);
  return succeed('Формулировка миссии обновлена.');
}

/** Применить одно подтверждённое предложение к «Теории проекта». */
export function applyTheoryEdit(projectId: number, proposal: Proposal): ApplyResult {
  const form = normalizeForm(JSON.parse(JSON.stringify(readTheoryForm(projectId))) as Partial<TheoryForm>);
  const refs = buildRefs(form);

  const listName = (proposal.list ?? '').trim().toLowerCase();
  if (proposal.op === 'update_field' || MISSION_LIST_ALIASES.has(listName)) {
    return applyMission(projectId, form, refs, proposal);
  }

  let block = resolveBlock(proposal.list);
  if (!block) {
    if (proposal.op === 'add_item' || proposal.op === 'update_item') block = inferBlockByValues(proposal.values);
    if (!block && (proposal.op === 'update_item' || proposal.op === 'delete_item')) block = inferBlockByItemId(form, proposal.item_id);
  }
  if (!block) {
    return fail('Не понял, какой блок Теории менять — укажите list: mission/stakeholder/results/competencies/constraints/quality/preserve.');
  }

  // Динамический доступ по ключам form (формKey/nextIdKey) — через Record-проекцию.
  const formRecord = form as unknown as Record<string, unknown>;
  const arr = [...(formRecord[block.formKey] as FormItem[])];
  const labelOf = (item: FormItem, index = 0) => itemLabel(item, block!.labelKeys, `${block!.title} ${index + 1}`);

  if (proposal.op === 'add_item') {
    const id = Number(formRecord[block.nextIdKey]) || nextItemId(arr);
    const item = block.createItem(id);
    applyValues(item as unknown as Record<string, unknown>, block.fields, proposal.values, refs);
    arr.push(item);
    formRecord[block.nextIdKey] = id + 1;
  } else if (proposal.op === 'update_item') {
    const idx = pickIndex(arr, proposal.item_id, i => String(i.id), it => labelOf(it));
    if (idx === -1) return fail('Не найден элемент Теории для изменения.');
    const item = { ...arr[idx] };
    const values = proposal.values ?? (proposal.field ? { [proposal.field]: proposal.value } : undefined);
    if (!applyValues(item as unknown as Record<string, unknown>, block.fields, values, refs)) {
      return fail('Нечего изменять: не распознаны поля.');
    }
    arr[idx] = item;
  } else if (proposal.op === 'delete_item') {
    const idx = pickIndex(arr, proposal.item_id, i => String(i.id), it => labelOf(it));
    if (idx === -1) return fail('Не найден элемент Теории для удаления.');
    arr.splice(idx, 1);
  } else {
    return fail('Неизвестная операция.');
  }

  formRecord[block.formKey] = arr;
  writeForm(projectId, form);
  return succeed(proposal.op === 'add_item' ? 'Добавлено новое окно.' : proposal.op === 'delete_item' ? 'Окно удалено.' : 'Формулировка обновлена.');
}
