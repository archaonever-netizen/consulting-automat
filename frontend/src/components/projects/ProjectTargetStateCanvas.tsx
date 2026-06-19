import { useEffect, useMemo, useState, type ReactNode } from 'react';
import DraftCard from './DraftCard';
import Icon from '../Icon';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { getFallbackProjectStrategicChoiceSnapshot, readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { readProjectTargetStateSnapshot, writeProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot, type ProjectTheoryBlockId } from './projectTheorySnapshot';

type TargetState = {
  status: string;
  statement: string;
  type: string;
  whereClient: string;
  whereGeography: string;
  whereProduct: string;
  whereProcess: string;
  whereExcluded: string;
  howApproach: string;
  howValue: string;
  howAdvantage: string;
  howObstacle: string;
  howBetter: string;
  objective: string;
  finalStatement: string;
};

type TargetResult = {
  id: number;
  name: string;
  criterion: string;
  perspective: string;
  metric: string;
  baseline: string;
  target: string;
  unit: string;
  deadline: string;
  controlSource: string;
  owner: string;
};

type StakeholderValue = {
  id: number;
  name: string;
  stakeholder: string;
  valueType: string;
  change: string;
  measurement: string;
  minimum: string;
};

type OperatingModel = {
  id: number;
  name: string;
  process: string;
  targetWork: string;
  metric: string;
  target: string;
  controlSource: string;
  owner: string;
};

type CapabilityTarget = {
  id: number;
  name: string;
  competency: string;
  currentLevel: string;
  requiredLevel: string;
  gap: string;
  developmentAction: string;
  owner: string;
};

type ManagementSystemTarget = {
  id: number;
  name: string;
  systemType: string;
  targetWork: string;
  supportsChoice: string;
  dataSource: string;
  owner: string;
};

type QualityTarget = {
  id: number;
  name: string;
  qualityIndicator: string;
  minimum: string;
  target: string;
  controlSource: string;
  deviationAction: string;
};

type PreserveTarget = {
  id: number;
  name: string;
  preserveElement: string;
  targetLook: string;
  indicator: string;
  minimum: string;
  forbiddenChange: string;
};

type ConstraintTarget = {
  id: number;
  name: string;
  constraint: string;
  compliance: string;
  limit: string;
  controlSource: string;
  violationConsequence: string;
};

type ComparisonRow = {
  id: string;
  area: string;
  change: string;
  preserve: string;
};

type KeyResult = {
  id: number;
  name: string;
  statement: string;
  metric: string;
  target: string;
  deadline: string;
  controlSource: string;
  indisputable: string;
};

const statusOptions = ['Не заполнено', 'Заполнено частично', 'Есть методологическая ошибка', 'Валидно'];
const targetTypeOptions = ['Финансовое', 'Клиентское', 'Внутренние процессы', 'Обучение и развитие', 'Системное / интегральное'];
const perspectiveOptions = ['Финансы', 'Клиенты', 'Внутренние процессы', 'Обучение и развитие'];
const valueTypeOptions = ['характеристики продукта / услуги', 'отношения с клиентом', 'имидж / репутация'];
const processMetricOptions = ['время', 'качество', 'издержки'];
const managementSystemOptions = ['метрики', 'отчетность', 'управленческий ритм', 'владельцы решений', 'контроль', 'данные', 'распределение ресурсов', 'обратная связь'];
const dataSourceOptions = ['financial report', 'CRM', 'HR', 'audit', 'акт приемки', 'операционный отчет', 'управленческий отчет', 'опрос клиентов'];
const unitOptions = ['₽', '%', 'шт.', 'баллы', 'часы', 'дни', 'выполнено-не выполнено'];
const yesNoOptions = ['да', 'нет'];

export const createTargetState = (): TargetState => ({
  status: 'Не заполнено',
  statement: '',
  type: '',
  whereClient: '',
  whereGeography: '',
  whereProduct: '',
  whereProcess: '',
  whereExcluded: '',
  howApproach: '',
  howValue: '',
  howAdvantage: '',
  howObstacle: '',
  howBetter: '',
  objective: '',
  finalStatement: '',
});

export const createTargetResult = (id: number, criterion = ''): TargetResult => ({
  id,
  name: '',
  criterion,
  perspective: '',
  metric: '',
  baseline: '',
  target: '',
  unit: '',
  deadline: '',
  controlSource: '',
  owner: '',
});

export const createStakeholderValue = (id: number, stakeholder = ''): StakeholderValue => ({
  id,
  name: '',
  stakeholder,
  valueType: '',
  change: '',
  measurement: '',
  minimum: '',
});

export const createOperatingModel = (id: number): OperatingModel => ({
  id,
  name: '',
  process: '',
  targetWork: '',
  metric: '',
  target: '',
  controlSource: '',
  owner: '',
});

export const createCapabilityTarget = (id: number, competency = ''): CapabilityTarget => ({
  id,
  name: '',
  competency,
  currentLevel: '',
  requiredLevel: '',
  gap: '',
  developmentAction: '',
  owner: '',
});

export const createManagementSystemTarget = (id: number): ManagementSystemTarget => ({
  id,
  name: '',
  systemType: '',
  targetWork: '',
  supportsChoice: '',
  dataSource: '',
  owner: '',
});

export const createQualityTarget = (id: number, qualityIndicator = ''): QualityTarget => ({
  id,
  name: '',
  qualityIndicator,
  minimum: '',
  target: '',
  controlSource: '',
  deviationAction: '',
});

export const createPreserveTarget = (id: number, preserveElement = ''): PreserveTarget => ({
  id,
  name: '',
  preserveElement,
  targetLook: '',
  indicator: '',
  minimum: '',
  forbiddenChange: '',
});

export const createConstraintTarget = (id: number, constraint = ''): ConstraintTarget => ({
  id,
  name: '',
  constraint,
  compliance: '',
  limit: '',
  controlSource: '',
  violationConsequence: '',
});

export const createKeyResult = (id: number): KeyResult => ({
  id,
  name: '',
  statement: '',
  metric: '',
  target: '',
  deadline: '',
  controlSource: '',
  indisputable: '',
});

const createComparisonRows = (): ComparisonRow[] => [
  'Изменяемые практики',
  'Изменяемые процессы',
  'Изменяемая структура',
  'Изменяемые системы управления',
  'Сохраняемые ценности',
  'Сохраняемое предназначение',
  'Сохраняемые обязательства',
  'Сохраняемые стандарты качества',
].map((area, index) => ({ id: String(index + 1), area, change: '', preserve: '' }));

function hasText(value: string) {
  return value.trim().length > 0;
}

function compactJoin(values: Array<string | undefined>) {
  return values.map(value => value?.trim()).filter(Boolean).join('; ');
}

function getTheoryBlock(snapshot: ReturnType<typeof getFallbackProjectTheorySnapshot>, id: ProjectTheoryBlockId) {
  return snapshot.blocks.find(block => block.id === id) || getFallbackProjectTheorySnapshot(snapshot.projectId).blocks.find(block => block.id === id)!;
}

function labels(items: Array<{ label: string }>, fallback: string) {
  const values = items.map(item => item.label).filter(Boolean);
  return values.length ? values : [fallback];
}

function TextField({
  label,
  value,
  onChange,
  placeholder = '',
  multiline = false,
  readOnly = false,
  className = '',
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <label className={`project-theory-field ${className}`.trim()}>
      <span>{label}</span>
      {multiline ? (
        <textarea className="form-textarea" value={value} placeholder={placeholder} readOnly={readOnly} onChange={event => onChange?.(event.target.value)} />
      ) : (
        <input className="form-input" value={value} placeholder={placeholder} readOnly={readOnly} onChange={event => onChange?.(event.target.value)} />
      )}
    </label>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="project-theory-field">
      <span>{label}</span>
      <select className="form-select" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Выберите значение</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function TargetSection({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="project-theory-section">
      <div className="project-theory-section-head">
        <span>{number}</span>
        <div>
          <h3>{title}</h3>
          <p>{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

type TargetForm = {
  target: TargetState;
  targetResults: TargetResult[];
  stakeholderValues: StakeholderValue[];
  operatingModels: OperatingModel[];
  capabilityTargets: CapabilityTarget[];
  managementTargets: ManagementSystemTarget[];
  qualityTargets: QualityTarget[];
  preserveTargets: PreserveTarget[];
  constraintTargets: ConstraintTarget[];
  comparisonRows: ComparisonRow[];
  keyResults: KeyResult[];
};

interface ProjectTargetStateCanvasProps {
  projectId: number;
}

export default function ProjectTargetStateCanvas({ projectId }: ProjectTargetStateCanvasProps) {
  const theory = useMemo(() => readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId), [projectId]);
  const diagnosis = useMemo(() => readProjectDiagnosisSnapshot(projectId) || getFallbackProjectDiagnosisSnapshot(projectId), [projectId]);
  const strategy = useMemo(() => readProjectStrategicChoiceSnapshot(projectId) || getFallbackProjectStrategicChoiceSnapshot(projectId), [projectId]);

  const mission = getTheoryBlock(theory, 'mission');
  const stakeholder = getTheoryBlock(theory, 'stakeholder');
  const results = getTheoryBlock(theory, 'results');
  const competencies = getTheoryBlock(theory, 'competencies');
  const constraints = getTheoryBlock(theory, 'constraints');
  const quality = getTheoryBlock(theory, 'quality');
  const preserve = getTheoryBlock(theory, 'preserve');

  const resultOptions = labels(results.items, 'Сначала заполните критерии результата');
  const stakeholderOptions = labels(stakeholder.items, 'Сначала заполните выгодоприобретателей');
  const competencyOptions = labels(competencies.items, 'Сначала заполните компетенции');
  const constraintOptions = labels(constraints.items, 'Сначала заполните ограничения');
  const qualityOptions = labels(quality.items, 'Сначала заполните показатели качества');
  const preserveOptions = labels(preserve.items, 'Сначала заполните сохраняемое ядро');
  const strategyChoiceOptions = [
    strategy.whereToPlay || 'where to play',
    strategy.howToWin || 'how to win',
    ...strategy.capabilities.map(item => item.label),
  ].filter(Boolean);

  const savedForm = useMemo(() => readProjectTargetStateSnapshot(projectId)?.form as TargetForm | undefined, [projectId]);
  const [target, setTarget] = useState<TargetState>(() => savedForm?.target ?? createTargetState());
  const [targetResults, setTargetResults] = useState<TargetResult[]>(() => savedForm?.targetResults ?? [createTargetResult(1, resultOptions[0] || '')]);
  const [stakeholderValues, setStakeholderValues] = useState<StakeholderValue[]>(() => savedForm?.stakeholderValues ?? [createStakeholderValue(1, stakeholderOptions[0] || '')]);
  const [operatingModels, setOperatingModels] = useState<OperatingModel[]>(() => savedForm?.operatingModels ?? [createOperatingModel(1)]);
  const [capabilityTargets, setCapabilityTargets] = useState<CapabilityTarget[]>(() => savedForm?.capabilityTargets ?? [createCapabilityTarget(1, competencyOptions[0] || strategy.capabilities[0]?.label || '')]);
  const [managementTargets, setManagementTargets] = useState<ManagementSystemTarget[]>(() => savedForm?.managementTargets ?? [createManagementSystemTarget(1)]);
  const [qualityTargets, setQualityTargets] = useState<QualityTarget[]>(() => savedForm?.qualityTargets ?? [createQualityTarget(1, qualityOptions[0] || '')]);
  const [preserveTargets, setPreserveTargets] = useState<PreserveTarget[]>(() => savedForm?.preserveTargets ?? [createPreserveTarget(1, preserveOptions[0] || '')]);
  const [constraintTargets, setConstraintTargets] = useState<ConstraintTarget[]>(() => savedForm?.constraintTargets ?? [createConstraintTarget(1, constraintOptions[0] || '')]);
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>(() => savedForm?.comparisonRows ?? createComparisonRows());
  const [keyResults, setKeyResults] = useState<KeyResult[]>(() => savedForm?.keyResults ?? [createKeyResult(1)]);

  const statement = target.statement || `[система / функция / команда] работает для ${target.whereClient || strategy.whereClient || stakeholder.items[0]?.label || '[клиент / выгодоприобретатель]'} так, что ${targetResults[0]?.target || results.items[0]?.label || '[измеримый результат]'}, за счет ${target.howApproach || strategy.howToWin || '[how to win / capabilities / management systems]'}, без нарушения ${constraints.items[0]?.label || preserve.items[0]?.label || '[ограничения / сохраняемое ядро]'}.`;
  const finalStatement = target.finalStatement || `В целевом состоянии [система / функция / команда] действует в ${compactJoin([target.whereClient || strategy.whereClient, target.whereGeography || strategy.whereGeography, target.whereProduct || strategy.whereProduct, target.whereProcess || strategy.whereProcess]) || '[where to play]'}, выигрывает за счет ${target.howApproach || strategy.howToWin || '[how to win]'}, создает ${target.howValue || strategy.howValue || '[ценность]'} для ${target.whereClient || strategy.whereClient || stakeholder.items[0]?.label || '[клиент / выгодоприобретатель]'}, достигает ${targetResults.map(item => item.target || item.criterion).filter(Boolean).join(', ') || '[целевые результаты]'}, поддерживается ${capabilityTargets.map(item => item.competency).filter(Boolean).join(', ') || '[capabilities]'} + ${strategy.managementSystems || '[management systems]'}, соблюдает ${constraintTargets.map(item => item.constraint).filter(Boolean).join(', ') || '[ограничения]'} + ${qualityTargets.map(item => item.qualityIndicator).filter(Boolean).join(', ') || '[качество]'} и сохраняет ${preserveTargets.map(item => item.preserveElement).filter(Boolean).join(', ') || '[ядро]'}.`;

  useEffect(() => {
    const timer = setTimeout(() => writeProjectTargetStateSnapshot(projectId, {
      projectId,
      updatedAt: new Date().toISOString(),
      statement,
      type: target.type,
      whereToPlay: compactJoin([target.whereClient || strategy.whereClient, target.whereGeography || strategy.whereGeography, target.whereProduct || strategy.whereProduct, target.whereProcess || strategy.whereProcess]),
      howToWin: compactJoin([target.howApproach || strategy.howToWin, target.howValue || strategy.howValue, target.howAdvantage || strategy.howAdvantage]),
      objective: target.objective,
      finalStatement,
      results: targetResults.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.criterion || item.metric || `Целевой результат ${item.id}`,
        summary: compactJoin([item.metric || results.items.find(result => result.label === item.criterion)?.summary, item.baseline && `база: ${item.baseline}`, item.target && `цель: ${item.target}`, item.unit, item.deadline, item.controlSource]),
      })),
      stakeholderValues: stakeholderValues.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.stakeholder || `Выгодоприобретатель ${item.id}`,
        summary: compactJoin([item.valueType, item.change, item.measurement, item.minimum]),
      })),
      operatingModels: operatingModels.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.process || `Операционная модель ${item.id}`,
        summary: compactJoin([item.targetWork, item.metric, item.target, item.controlSource, item.owner]),
      })),
      capabilities: capabilityTargets.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.competency || `Capability ${item.id}`,
        summary: compactJoin([item.currentLevel || strategy.capabilities.find(capability => capability.label === item.competency)?.summary, item.requiredLevel, item.gap, item.developmentAction, item.owner]),
      })),
      managementSystems: managementTargets.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.systemType || `Management system ${item.id}`,
        summary: compactJoin([item.targetWork, item.supportsChoice, item.dataSource, item.owner]),
      })),
      qualityTargets: qualityTargets.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.qualityIndicator || `Качество ${item.id}`,
        summary: compactJoin([item.minimum || quality.items.find(q => q.label === item.qualityIndicator)?.summary, item.target, item.controlSource, item.deviationAction]),
      })),
      preserveTargets: preserveTargets.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.preserveElement || `Сохраняемое ядро ${item.id}`,
        summary: compactJoin([item.targetLook, item.indicator || preserve.items.find(p => p.label === item.preserveElement)?.summary, item.minimum, item.forbiddenChange]),
      })),
      constraints: constraintTargets.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.constraint || `Ограничение ${item.id}`,
        summary: compactJoin([item.compliance, item.limit || constraints.items.find(c => c.label === item.constraint)?.summary, item.controlSource, item.violationConsequence]),
      })),
      keyResults: keyResults.map(item => ({
        id: String(item.id),
        label: item.name.trim() || item.statement || `Key Result ${item.id}`,
        summary: compactJoin([item.metric, item.target, item.deadline, item.controlSource, item.indisputable]),
      })),
      form: {
        target, targetResults, stakeholderValues, operatingModels, capabilityTargets,
        managementTargets, qualityTargets, preserveTargets, constraintTargets, comparisonRows, keyResults,
      } satisfies TargetForm,
    }), 400);
    return () => clearTimeout(timer);
  }, [
    capabilityTargets,
    comparisonRows,
    constraintTargets,
    constraints.items,
    finalStatement,
    keyResults,
    managementTargets,
    operatingModels,
    preserve.items,
    preserveTargets,
    projectId,
    quality.items,
    qualityTargets,
    results.items,
    statement,
    stakeholderValues,
    strategy.capabilities,
    strategy.howAdvantage,
    strategy.howToWin,
    strategy.howValue,
    strategy.whereClient,
    strategy.whereGeography,
    strategy.whereProcess,
    strategy.whereProduct,
    target,
    targetResults,
  ]);

  const validationChecks = [
    ['есть связь со стратегическим выбором', strategy.acceptedChoice || strategy.whereToPlay || strategy.howToWin],
    ['есть связь с диагнозом', diagnosis.keyChallenge || diagnosis.finalStatement],
    ['целевое состояние отвечает миссии', mission.expectedState],
    ['указан клиент / выгодоприобретатель', target.whereClient || strategy.whereClient],
    ['указано where to play', target.whereClient || target.whereProcess || strategy.whereToPlay],
    ['указано how to win', target.howApproach || strategy.howToWin],
    ['есть целевые результаты', targetResults.some(item => hasText(item.criterion) || hasText(item.target)) ? 'yes' : ''],
    ['есть целевые значения', targetResults.some(item => hasText(item.target)) || keyResults.some(item => hasText(item.target)) ? 'yes' : ''],
    ['есть источники контроля', targetResults.some(item => hasText(item.controlSource)) || qualityTargets.some(item => hasText(item.controlSource)) ? 'yes' : ''],
    ['указаны capabilities', capabilityTargets.some(item => hasText(item.competency)) ? 'yes' : ''],
    ['указаны management systems', managementTargets.some(item => hasText(item.systemType) || hasText(item.targetWork)) ? 'yes' : ''],
    ['указано, что меняется', comparisonRows.some(item => hasText(item.change)) ? 'yes' : ''],
    ['указано, что сохраняется', comparisonRows.some(item => hasText(item.preserve)) || preserveTargets.some(item => hasText(item.preserveElement)) ? 'yes' : ''],
    ['качество задано через измеримый показатель', qualityTargets.some(item => hasText(item.qualityIndicator) && hasText(item.target)) ? 'yes' : ''],
    ['ограничения соблюдены', constraintTargets.some(item => hasText(item.constraint) && hasText(item.compliance)) ? 'yes' : ''],
    ['сохраняемое ядро не разрушено', preserveTargets.some(item => hasText(item.preserveElement) && hasText(item.targetLook)) ? 'yes' : ''],
  ];
  const completedChecks = validationChecks.filter(([, value]) => hasText(String(value))).length;
  const autoStatus = completedChecks === validationChecks.length ? 'Валидно' : completedChecks >= 8 ? 'Заполнено частично' : 'Не заполнено';

  function updateTarget(patch: Partial<TargetState>) {
    setTarget(current => ({ ...current, ...patch }));
  }

  function updateComparison(id: string, patch: Partial<ComparisonRow>) {
    setComparisonRows(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  return (
    <div className="project-theory project-target-state">
      <section className="project-theory-hero">
        <div>
          <div className="project-panel-title">Целевое состояние</div>
          <h2>Какой должна стать система после выбранной стратегии</h2>
          <p>Экран собирает будущую модель из Теории проекта, Диагноза и Стратегического выбора: клиент, зона действия, способ выигрыша, результаты, capabilities, systems, качество, ограничения и сохраняемое ядро.</p>
        </div>
        <label className="project-theory-status">
          <span>Статус проверки</span>
          <select className="form-select" value={target.status || autoStatus} onChange={event => updateTarget({ status: event.target.value })}>
            {statusOptions.map(option => <option key={option}>{option}</option>)}
          </select>
          <small>{completedChecks} из {validationChecks.length} проверок закрыто</small>
        </label>
      </section>

      <TargetSection number="0" title="Связи с предыдущими экранами" note="Целевое состояние не придумывается заново: оно уточняет будущую систему после выбранной стратегии.">
        <div className="project-strategy-source-grid">
          <div className="project-strategy-source-card">
            <b>Теория проекта</b>
            {[mission, stakeholder, results, competencies, constraints, quality, preserve].map(block => (
              <div className="project-strategy-source-line" key={block.id}>
                <span>{block.title}</span>
                <em>{block.items[0]?.label || block.expectedState}</em>
              </div>
            ))}
          </div>
          <div className="project-strategy-source-card">
            <b>Диагноз</b>
            <span>Ключевой вызов</span>
            <strong>{diagnosis.keyChallenge || diagnosis.finalStatement || 'Сначала заполните Диагноз'}</strong>
            <span>Главное препятствие</span>
            <em>{diagnosis.obstacleType || 'Не указано'}</em>
            <span>Разрывы теории и реальности</span>
            <em>{diagnosis.gaps.map(item => item.label).join(', ') || 'Не указаны'}</em>
            <span>Факты</span>
            <em>{diagnosis.facts.map(item => item.label).join(', ') || 'Не указаны'}</em>
          </div>
          <div className="project-strategy-source-card">
            <b>Стратегический выбор</b>
            <span>Winning aspiration</span>
            <strong>{strategy.winningAspiration || 'Сначала заполните Стратегический выбор'}</strong>
            <span>Where / How</span>
            <em>{compactJoin([strategy.whereToPlay, strategy.howToWin]) || 'Не указано'}</em>
            <span>Capabilities</span>
            <em>{strategy.capabilities.map(item => item.label).join(', ') || 'Не указаны'}</em>
            <span>Management systems</span>
            <em>{strategy.managementSystems || 'Не указаны'}</em>
            <span>Trade-offs</span>
            <em>{strategy.tradeOffs.map(item => item.label).join(', ') || 'Не указаны'}</em>
            <span>Guiding policy</span>
            <em>{strategy.guidingPolicy || 'Не указана'}</em>
          </div>
        </div>
      </TargetSection>

      <TargetSection number="1-4" title="Формулировка, тип, where to play и how to win" note="Фиксируем общую будущую правду о системе, ее тип и стратегическую позицию.">
        <div className="project-theory-grid two">
          <TextField label="1. Формулировка целевого состояния" value={statement} onChange={value => updateTarget({ statement: value })} multiline />
          <SelectField label="2. Тип целевого состояния" options={targetTypeOptions} value={target.type} onChange={value => updateTarget({ type: value })} />
          <SelectField label="3. Выбранный клиент / сегмент" options={stakeholderOptions} value={target.whereClient || strategy.whereClient} onChange={value => updateTarget({ whereClient: value })} />
          <TextField label="3. Выбранная география" value={target.whereGeography || strategy.whereGeography} onChange={value => updateTarget({ whereGeography: value })} />
          <TextField label="3. Продукт / услуга / функция" value={target.whereProduct || strategy.whereProduct} onChange={value => updateTarget({ whereProduct: value })} />
          <TextField label="3. Процесс / зона системы" value={target.whereProcess || strategy.whereProcess} onChange={value => updateTarget({ whereProcess: value })} />
          <TextField label="3. Что не входит в целевое состояние" value={target.whereExcluded || strategy.whereExcluded} onChange={value => updateTarget({ whereExcluded: value })} multiline />
          <TextField label="4. Выбранный способ выигрыша" value={target.howApproach || strategy.howToWin} onChange={value => updateTarget({ howApproach: value })} multiline />
          <TextField label="4. Ценность для клиента" value={target.howValue || strategy.howValue} onChange={value => updateTarget({ howValue: value })} multiline />
          <TextField label="4. За счет чего возникает преимущество" value={target.howAdvantage || strategy.howAdvantage} onChange={value => updateTarget({ howAdvantage: value })} multiline />
          <TextField label="4. Какое препятствие преодолевается" value={target.howObstacle || diagnosis.keyChallenge || diagnosis.obstacleType} onChange={value => updateTarget({ howObstacle: value })} multiline />
          <TextField label="4. Почему это состояние лучше текущего" value={target.howBetter} onChange={value => updateTarget({ howBetter: value })} multiline />
        </div>
      </TargetSection>

      <TargetSection number="5-7" title="Результаты, клиентская ценность и операционная модель" note="Описываем целевые результаты, ценность для стейкхолдеров и будущие процессы через измеримые параметры.">
        <div className="project-diagnosis-split">
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">5. Целевые результаты</div>
            {targetResults.map((item, index) => (
              <DraftCard key={item.id} card={item} title={`Результат ${index + 1}`} onApply={next => setTargetResults(current => current.map(row => row.id === next.id ? next : row))}>
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название результата</span>
                      <input className="form-input" placeholder={`Результат ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Связанный критерий результата" options={resultOptions} value={draft.criterion} onChange={value => patch({ criterion: value })} />
                      <SelectField label="Перспектива" options={perspectiveOptions} value={draft.perspective} onChange={value => patch({ perspective: value })} />
                      <TextField label="Метрика" value={draft.metric || results.items.find(result => result.label === draft.criterion)?.summary || ''} onChange={value => patch({ metric: value })} />
                      <TextField label="Базовое значение" value={draft.baseline} onChange={value => patch({ baseline: value })} />
                      <TextField label="Целевое значение" value={draft.target} onChange={value => patch({ target: value })} />
                      <SelectField label="Единица измерения" options={unitOptions} value={draft.unit} onChange={value => patch({ unit: value })} />
                      <TextField label="Срок достижения" value={draft.deadline} onChange={value => patch({ deadline: value })} />
                      <SelectField label="Источник контроля" options={dataSourceOptions} value={draft.controlSource} onChange={value => patch({ controlSource: value })} />
                      <TextField label="Владелец результата" value={draft.owner} onChange={value => patch({ owner: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setTargetResults(current => [...current, createTargetResult(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить результат
            </button>
          </div>
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">6. Клиентская ценность</div>
            {stakeholderValues.map((item, index) => (
              <DraftCard key={item.id} card={item} title={`Ценность ${index + 1}`} onApply={next => setStakeholderValues(current => current.map(row => row.id === next.id ? next : row))}>
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название ценности</span>
                      <input className="form-input" placeholder={`Ценность ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Связанный клиент / выгодоприобретатель" options={stakeholderOptions} value={draft.stakeholder} onChange={value => patch({ stakeholder: value })} />
                      <SelectField label="Тип ценности" options={valueTypeOptions} value={draft.valueType} onChange={value => patch({ valueType: value })} />
                      <TextField label="Что изменится для клиента" value={draft.change} onChange={value => patch({ change: value })} multiline />
                      <SelectField label="Как измеряется ценность" options={[...resultOptions, ...qualityOptions]} value={draft.measurement} onChange={value => patch({ measurement: value })} />
                      <TextField label="Минимальный уровень принятия" value={draft.minimum} onChange={value => patch({ minimum: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setStakeholderValues(current => [...current, createStakeholderValue(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить ценность
            </button>
          </div>
        </div>
        <div className="project-theory-repeater" style={{ marginTop: 12 }}>
          <div className="project-theory-card-title">7. Целевая операционная модель</div>
          {operatingModels.map((item, index) => (
            <DraftCard key={item.id} card={item} title={`Процесс / система ${index + 1}`} onApply={next => setOperatingModels(current => current.map(row => row.id === next.id ? next : row))}>
              {(draft, patch) => (
                <>
                  <label className="project-theory-field">
                    <span>Название процесса / системы</span>
                    <input className="form-input" placeholder={`Процесс / система ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                  </label>
                  <div className="project-theory-grid three">
                    <TextField label="Связанный процесс / функция" value={draft.process} onChange={value => patch({ process: value })} />
                    <TextField label="Как должно работать" value={draft.targetWork} onChange={value => patch({ targetWork: value })} multiline />
                    <SelectField label="Целевая метрика процесса" options={processMetricOptions} value={draft.metric} onChange={value => patch({ metric: value })} />
                    <TextField label="Целевое значение" value={draft.target} onChange={value => patch({ target: value })} />
                    <SelectField label="Источник контроля" options={dataSourceOptions} value={draft.controlSource} onChange={value => patch({ controlSource: value })} />
                    <TextField label="Владелец процесса" value={draft.owner} onChange={value => patch({ owner: value })} />
                  </div>
                </>
              )}
            </DraftCard>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setOperatingModels(current => [...current, createOperatingModel(current.length + 1)])}>
            <Icon name="plus" size={16} />
            Добавить процесс
          </button>
        </div>
      </TargetSection>

      <TargetSection number="8-11" title="Capabilities, systems, качество и ядро" note="Фиксируем способности, системы управления, качество и сохраняемое ядро в целевой модели.">
        <div className="project-diagnosis-split">
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">8. Целевые capabilities</div>
            {capabilityTargets.map((item, index) => (
              <DraftCard key={item.id} card={item} title={`Компетенция ${index + 1}`} onApply={next => setCapabilityTargets(current => current.map(row => row.id === next.id ? next : row))}>
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название компетенции</span>
                      <input className="form-input" placeholder={`Компетенция ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Связанная компетенция" options={[...competencyOptions, ...strategy.capabilities.map(capability => capability.label)]} value={draft.competency} onChange={value => patch({ competency: value })} />
                      <TextField label="Текущий уровень" value={draft.currentLevel || strategy.capabilities.find(capability => capability.label === draft.competency)?.summary || ''} onChange={value => patch({ currentLevel: value })} />
                      <TextField label="Требуемый уровень" value={draft.requiredLevel} onChange={value => patch({ requiredLevel: value })} />
                      <TextField label="Разрыв" value={draft.gap} onChange={value => patch({ gap: value })} />
                      <TextField label="Что создать / усилить" value={draft.developmentAction} onChange={value => patch({ developmentAction: value })} multiline />
                      <TextField label="Владелец развития" value={draft.owner} onChange={value => patch({ owner: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setCapabilityTargets(current => [...current, createCapabilityTarget(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить компетенцию
            </button>
          </div>
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">9. Management systems</div>
            {managementTargets.map((item, index) => (
              <DraftCard key={item.id} card={item} title={`Система ${index + 1}`} onApply={next => setManagementTargets(current => current.map(row => row.id === next.id ? next : row))}>
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название системы</span>
                      <input className="form-input" placeholder={`Система ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Тип системы" options={managementSystemOptions} value={draft.systemType} onChange={value => patch({ systemType: value })} />
                      <TextField label="Как должна работать" value={draft.targetWork || strategy.managementSystems} onChange={value => patch({ targetWork: value })} multiline />
                      <SelectField label="Что поддерживает" options={strategyChoiceOptions} value={draft.supportsChoice} onChange={value => patch({ supportsChoice: value })} />
                      <SelectField label="Источник данных" options={dataSourceOptions} value={draft.dataSource} onChange={value => patch({ dataSource: value })} />
                      <TextField label="Владелец системы" value={draft.owner} onChange={value => patch({ owner: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setManagementTargets(current => [...current, createManagementSystemTarget(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить систему
            </button>
          </div>
        </div>
        <div className="project-diagnosis-split" style={{ marginTop: 12 }}>
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">10. Целевое качество</div>
            {qualityTargets.map((item, index) => (
              <DraftCard key={item.id} card={item} title={`Качество ${index + 1}`} onApply={next => setQualityTargets(current => current.map(row => row.id === next.id ? next : row))}>
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название показателя</span>
                      <input className="form-input" placeholder={`Качество ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Связанный показатель качества" options={qualityOptions} value={draft.qualityIndicator} onChange={value => patch({ qualityIndicator: value })} />
                      <TextField label="Минимально допустимый уровень" value={draft.minimum || quality.items.find(q => q.label === draft.qualityIndicator)?.summary || ''} onChange={value => patch({ minimum: value })} />
                      <TextField label="Целевой уровень" value={draft.target} onChange={value => patch({ target: value })} />
                      <SelectField label="Источник контроля" options={dataSourceOptions} value={draft.controlSource} onChange={value => patch({ controlSource: value })} />
                      <TextField label="Действие при отклонении" value={draft.deviationAction} onChange={value => patch({ deviationAction: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setQualityTargets(current => [...current, createQualityTarget(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить качество
            </button>
          </div>
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">11. Сохраняемое ядро</div>
            {preserveTargets.map((item, index) => (
              <DraftCard key={item.id} card={item} title={`Ядро ${index + 1}`} onApply={next => setPreserveTargets(current => current.map(row => row.id === next.id ? next : row))}>
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название элемента ядра</span>
                      <input className="form-input" placeholder={`Ядро ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Что нельзя разрушить" options={preserveOptions} value={draft.preserveElement} onChange={value => patch({ preserveElement: value })} />
                      <TextField label="Как выглядит в целевом состоянии" value={draft.targetLook} onChange={value => patch({ targetLook: value })} multiline />
                      <TextField label="Индикатор сохранности" value={draft.indicator || preserve.items.find(p => p.label === draft.preserveElement)?.summary || ''} onChange={value => patch({ indicator: value })} />
                      <TextField label="Минимально допустимый уровень" value={draft.minimum} onChange={value => patch({ minimum: value })} />
                      <TextField label="Запрещенное изменение" value={draft.forbiddenChange} onChange={value => patch({ forbiddenChange: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setPreserveTargets(current => [...current, createPreserveTarget(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить ядро
            </button>
          </div>
        </div>
      </TargetSection>

      <TargetSection number="12-13" title="Что изменится, что сохранится, ограничения" note="Целевая модель должна явно различать изменяемые практики и сохраняемое ядро, а также соблюдать ограничения.">
        <div className="project-theory-table">
          {comparisonRows.map(row => (
            <div className="project-theory-table-row three" key={row.id}>
              <b>{row.area}</b>
              <TextField label="Что изменится" value={row.change} onChange={value => updateComparison(row.id, { change: value })} />
              <TextField label="Что сохранится" value={row.preserve} onChange={value => updateComparison(row.id, { preserve: value })} />
            </div>
          ))}
        </div>
        <div className="project-theory-repeater" style={{ marginTop: 12 }}>
          {constraintTargets.map((item, index) => (
            <DraftCard key={item.id} card={item} title={`Ограничение ${index + 1}`} onApply={next => setConstraintTargets(current => current.map(row => row.id === next.id ? next : row))}>
              {(draft, patch) => (
                <>
                  <label className="project-theory-field">
                    <span>Название ограничения</span>
                    <input className="form-input" placeholder={`Ограничение ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                  </label>
                  <div className="project-theory-grid two">
                    <SelectField label="Связанное ограничение" options={constraintOptions} value={draft.constraint} onChange={value => patch({ constraint: value })} />
                    <TextField label="Как соблюдается" value={draft.compliance} onChange={value => patch({ compliance: value })} multiline />
                    <TextField label="Порог / лимит" value={draft.limit || constraints.items.find(c => c.label === draft.constraint)?.summary || ''} onChange={value => patch({ limit: value })} />
                    <SelectField label="Источник контроля" options={dataSourceOptions} value={draft.controlSource} onChange={value => patch({ controlSource: value })} />
                    <TextField label="Последствие нарушения" value={draft.violationConsequence} onChange={value => patch({ violationConsequence: value })} />
                  </div>
                </>
              )}
            </DraftCard>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setConstraintTargets(current => [...current, createConstraintTarget(current.length + 1)])}>
            <Icon name="plus" size={16} />
            Добавить ограничение
          </button>
        </div>
      </TargetSection>

      <TargetSection number="14-16" title="Objective, key results и итоговая формулировка" note="Objective задает направление, key results измеряют достижение без спора.">
        <div className="project-theory-grid two">
          <TextField label="14. Целевое состояние как objective" value={target.objective} onChange={value => updateTarget({ objective: value })} multiline />
          <TextField label="16. Итоговая формулировка" value={finalStatement} onChange={value => updateTarget({ finalStatement: value })} multiline />
        </div>
        <div className="project-theory-repeater" style={{ marginTop: 12 }}>
          {keyResults.map((item, index) => (
            <DraftCard key={item.id} card={item} title={`Key Result ${index + 1}`} onApply={next => setKeyResults(current => current.map(row => row.id === next.id ? next : row))}>
              {(draft, patch) => (
                <>
                  <label className="project-theory-field">
                    <span>Название key result</span>
                    <input className="form-input" placeholder={`Key Result ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                  </label>
                  <div className="project-theory-grid two">
                    <TextField label="Формулировка key result" value={draft.statement} onChange={value => patch({ statement: value })} multiline />
                    <SelectField label="Метрика" options={resultOptions} value={draft.metric} onChange={value => patch({ metric: value })} />
                    <TextField label="Целевое значение" value={draft.target} onChange={value => patch({ target: value })} />
                    <TextField label="Срок" value={draft.deadline} onChange={value => patch({ deadline: value })} />
                    <SelectField label="Источник контроля" options={dataSourceOptions} value={draft.controlSource} onChange={value => patch({ controlSource: value })} />
                    <SelectField label="Проверка без спора" options={yesNoOptions} value={draft.indisputable} onChange={value => patch({ indisputable: value })} />
                  </div>
                </>
              )}
            </DraftCard>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setKeyResults(current => [...current, createKeyResult(current.length + 1)])}>
            <Icon name="plus" size={16} />
            Добавить key result
          </button>
        </div>
      </TargetSection>

      <section className="project-theory-validation">
        <div>
          <div className="project-panel-title">17. Методологическая проверка</div>
          <h3>{autoStatus}</h3>
          <p>Целевое состояние валидно, когда связано со стратегией и диагнозом, измеримо, учитывает capabilities, systems, качество, ограничения и сохраняемое ядро.</p>
        </div>
        <div className="project-theory-validation-grid">
          {validationChecks.map(([label, value]) => (
            <label className="project-theory-validation-item" key={label}>
              <input type="checkbox" checked={hasText(String(value))} readOnly />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <label className="project-theory-field compact">
          <span>Итоговый статус</span>
          <input className="form-input" value={autoStatus} readOnly />
        </label>
      </section>
    </div>
  );
}
