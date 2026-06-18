import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Icon from '../Icon';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { writeProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot, type ProjectTheoryBlockId } from './projectTheorySnapshot';

type StrategicChoiceState = {
  status: string;
  strategicQuestion: string;
  winningAspiration: string;
  winType: string;
  whereClient: string;
  whereGeography: string;
  whereProduct: string;
  whereProcess: string;
  whereIncluded: string;
  whereExcluded: string;
  howApproach: string;
  howDiagnosisFit: string;
  howValue: string;
  howAdvantage: string;
  howSystemChange: string;
  howBetterThanAlternatives: string;
  managementMetrics: string;
  managementRhythm: string;
  decisionOwners: string;
  reporting: string;
  controlProcess: string;
  dataSystem: string;
  resourceAllocation: string;
  reviewMechanism: string;
  noActionWhatHappens: string;
  noActionMissedResult: string;
  noActionAffected: string;
  noActionVerdict: string;
  selectedAlternative: string;
  acceptedChoice: string;
  guidingPolicy: string;
};

type CapabilityCard = {
  id: number;
  name: string;
  competency: string;
  currentLevel: string;
  requiredLevel: string;
  gap: string;
  strengthen: string;
  external: string;
};

type AlternativeCard = {
  id: number;
  name: string;
  diagnosisFit: string;
  whereToPlay: string;
  howToWin: string;
  capabilities: string[];
  managementSystems: string;
  resourceCommitments: string;
  constraints: string[];
  preserveRisk: string[];
  whatNotToDo: string;
  status: string;
};

type TradeOffCard = {
  id: number;
  name: string;
  refusal: string;
  reason: string;
  releasedResource: string;
  reducedRisk: string;
  approver: string;
};

type ActionCard = {
  id: number;
  name: string;
  action: string;
  supportsChoice: string;
  resource: string;
  owner: string;
  deadline: string;
  dependency: string;
  futureLink: string;
};

type HypothesisCard = {
  id: number;
  name: string;
  assumption: string;
  choiceLink: string;
  confirms: string;
  refutes: string;
};

const statusOptions = ['Не заполнено', 'Заполнено частично', 'Есть методологическая ошибка', 'Валидно'];
const winTypeOptions = ['выигрыш через более низкую стоимость', 'выигрыш через дифференциацию / уникальную ценность'];
const alternativeStatusOptions = ['выбрана', 'отклонена', 'требует проверки', 'оставить как резерв'];

const createChoice = (): StrategicChoiceState => ({
  status: 'Не заполнено',
  strategicQuestion: '',
  winningAspiration: '',
  winType: '',
  whereClient: '',
  whereGeography: '',
  whereProduct: '',
  whereProcess: '',
  whereIncluded: '',
  whereExcluded: '',
  howApproach: '',
  howDiagnosisFit: '',
  howValue: '',
  howAdvantage: '',
  howSystemChange: '',
  howBetterThanAlternatives: '',
  managementMetrics: '',
  managementRhythm: '',
  decisionOwners: '',
  reporting: '',
  controlProcess: '',
  dataSystem: '',
  resourceAllocation: '',
  reviewMechanism: '',
  noActionWhatHappens: '',
  noActionMissedResult: '',
  noActionAffected: '',
  noActionVerdict: '',
  selectedAlternative: '',
  acceptedChoice: '',
  guidingPolicy: '',
});

const createCapability = (id: number, competency = ''): CapabilityCard => ({
  id,
  name: '',
  competency,
  currentLevel: '',
  requiredLevel: '',
  gap: '',
  strengthen: '',
  external: '',
});

const createAlternative = (id: number): AlternativeCard => ({
  id,
  name: '',
  diagnosisFit: '',
  whereToPlay: '',
  howToWin: '',
  capabilities: [],
  managementSystems: '',
  resourceCommitments: '',
  constraints: [],
  preserveRisk: [],
  whatNotToDo: '',
  status: 'требует проверки',
});

const createTradeOff = (id: number): TradeOffCard => ({
  id,
  name: '',
  refusal: '',
  reason: '',
  releasedResource: '',
  reducedRisk: '',
  approver: '',
});

const createAction = (id: number): ActionCard => ({
  id,
  name: '',
  action: '',
  supportsChoice: '',
  resource: '',
  owner: '',
  deadline: '',
  dependency: '',
  futureLink: '',
});

const createHypothesis = (id: number): HypothesisCard => ({
  id,
  name: '',
  assumption: '',
  choiceLink: '',
  confirms: '',
  refutes: '',
});

function hasText(value: string) {
  return value.trim().length > 0;
}

function compactJoin(values: Array<string | undefined>) {
  return values.map(value => value?.trim()).filter(Boolean).join('; ');
}

function getTheoryBlock(snapshot: ReturnType<typeof getFallbackProjectTheorySnapshot>, id: ProjectTheoryBlockId) {
  return snapshot.blocks.find(block => block.id === id) || getFallbackProjectTheorySnapshot(snapshot.projectId).blocks.find(block => block.id === id)!;
}

function itemLabels(items: Array<{ label: string }>, fallback: string) {
  return items.map(item => item.label).filter(Boolean).length ? items.map(item => item.label) : [fallback];
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
        <textarea
          className="form-textarea"
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={event => onChange?.(event.target.value)}
        />
      ) : (
        <input
          className="form-input"
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={event => onChange?.(event.target.value)}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
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

function Checklist({
  label,
  options,
  values,
  onToggle,
}: {
  label: string;
  options: string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="project-theory-field full">
      <span>{label}</span>
      <div className="project-theory-check-list dense">
        {options.map(option => (
          <label className="project-theory-check-option" key={option}>
            <input type="checkbox" checked={values.includes(option)} onChange={() => onToggle(option)} />
            <span>{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function StrategicSection({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
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

interface ProjectStrategicChoiceCanvasProps {
  projectId: number;
}

export default function ProjectStrategicChoiceCanvas({ projectId }: ProjectStrategicChoiceCanvasProps) {
  const theorySnapshot = useMemo(() => readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId), [projectId]);
  const diagnosisSnapshot = useMemo(() => readProjectDiagnosisSnapshot(projectId) || getFallbackProjectDiagnosisSnapshot(projectId), [projectId]);
  const mission = getTheoryBlock(theorySnapshot, 'mission');
  const stakeholder = getTheoryBlock(theorySnapshot, 'stakeholder');
  const results = getTheoryBlock(theorySnapshot, 'results');
  const competencies = getTheoryBlock(theorySnapshot, 'competencies');
  const constraints = getTheoryBlock(theorySnapshot, 'constraints');
  const quality = getTheoryBlock(theorySnapshot, 'quality');
  const preserve = getTheoryBlock(theorySnapshot, 'preserve');

  const competencyOptions = itemLabels(competencies.items, 'Сначала заполните компетенции в Теории проекта');
  const constraintOptions = itemLabels(constraints.items, 'Сначала заполните ограничения в Теории проекта');
  const preserveOptions = itemLabels(preserve.items, 'Сначала заполните сохраняемое ядро в Теории проекта');
  const resultOptions = itemLabels(results.items, 'Сначала заполните критерии результата в Теории проекта');
  const stakeholderOptions = itemLabels(stakeholder.items, 'Сначала заполните выгодоприобретателей в Теории проекта');

  const [choice, setChoice] = useState<StrategicChoiceState>(createChoice);
  const [capabilities, setCapabilities] = useState<CapabilityCard[]>(() => [createCapability(1, competencyOptions[0] || '')]);
  const [alternatives, setAlternatives] = useState<AlternativeCard[]>([createAlternative(1)]);
  const [tradeOffs, setTradeOffs] = useState<TradeOffCard[]>([createTradeOff(1)]);
  const [actions, setActions] = useState<ActionCard[]>([createAction(1)]);
  const [hypotheses, setHypotheses] = useState<HypothesisCard[]>([createHypothesis(1)]);

  const obstacle = diagnosisSnapshot.keyChallenge || diagnosisSnapshot.obstacleType || '[главное препятствие из Диагноза]';
  const strategicQuestion = choice.strategicQuestion || `Как нам преодолеть ${obstacle} для ${stakeholder.items[0]?.label || '[выгодоприобретатель]'}, чтобы достичь ${results.items[0]?.label || '[критерий результата]'}, не нарушив ${constraints.items[0]?.label || preserve.items[0]?.label || '[ограничения / ядро]'}?`;
  const winningAspiration = choice.winningAspiration || compactJoin([
    mission.expectedState,
    results.items[0]?.summary || results.expectedState,
    stakeholder.items[0]?.summary,
  ]);
  const acceptedChoice = choice.acceptedChoice || `Мы выбираем ${choice.whereClient || '[where to play]'}, чтобы выиграть через ${choice.howApproach || '[how to win]'}, потому что это преодолевает ${obstacle}, требует ${capabilities.map(item => item.competency).filter(Boolean).join(', ') || '[capabilities]'}, поддерживается ${choice.managementMetrics || choice.managementRhythm || '[management systems]'} и не нарушает ${choice.whereExcluded || constraints.items[0]?.label || preserve.items[0]?.label || '[ограничения / сохраняемое ядро]'}.`;
  const guidingPolicy = choice.guidingPolicy || `Для преодоления ${obstacle} мы будем ${choice.howApproach || '[подход]'}, фокусируя ресурсы на ${choice.whereProcess || choice.whereClient || '[зона выбора]'} и отказываясь от ${tradeOffs[0]?.refusal || '[что не делаем]'}.`;

  useEffect(() => {
    writeProjectStrategicChoiceSnapshot(projectId, {
      projectId,
      updatedAt: new Date().toISOString(),
      strategicQuestion,
      winningAspiration,
      winType: choice.winType,
      whereToPlay: compactJoin([choice.whereClient, choice.whereGeography, choice.whereProduct, choice.whereProcess]),
      whereClient: choice.whereClient,
      whereGeography: choice.whereGeography,
      whereProduct: choice.whereProduct,
      whereProcess: choice.whereProcess,
      whereIncluded: choice.whereIncluded,
      whereExcluded: choice.whereExcluded,
      howToWin: choice.howApproach,
      howDiagnosisFit: choice.howDiagnosisFit,
      howValue: choice.howValue,
      howAdvantage: choice.howAdvantage,
      howSystemChange: choice.howSystemChange,
      howBetterThanAlternatives: choice.howBetterThanAlternatives,
      managementSystems: compactJoin([
        choice.managementMetrics,
        choice.managementRhythm,
        choice.decisionOwners,
        choice.reporting,
        choice.controlProcess,
        choice.dataSystem,
        choice.resourceAllocation,
        choice.reviewMechanism,
      ]),
      acceptedChoice,
      guidingPolicy,
      capabilities: capabilities.map((capability, index) => ({
        id: String(capability.id),
        label: capability.name.trim() || capability.competency || `Capability ${index + 1}`,
        summary: compactJoin([
          capability.competency,
          capability.currentLevel ? `текущий уровень: ${capability.currentLevel}` : '',
          capability.requiredLevel ? `требуемый уровень: ${capability.requiredLevel}` : '',
          capability.gap ? `разрыв: ${capability.gap}` : '',
          capability.strengthen,
          capability.external,
        ]),
      })),
      tradeOffs: tradeOffs.map((tradeOff, index) => ({
        id: String(tradeOff.id),
        label: tradeOff.name.trim() || tradeOff.refusal || `Trade-off ${index + 1}`,
        summary: compactJoin([tradeOff.refusal, tradeOff.reason, tradeOff.releasedResource, tradeOff.reducedRisk, tradeOff.approver]),
      })),
      actions: actions.map((action, index) => ({
        id: String(action.id),
        label: action.name.trim() || action.action || `Действие ${index + 1}`,
        summary: compactJoin([action.action, action.supportsChoice, action.resource, action.owner, action.deadline, action.dependency, action.futureLink]),
      })),
      hypotheses: hypotheses.map((hypothesis, index) => ({
        id: String(hypothesis.id),
        label: hypothesis.name.trim() || hypothesis.assumption || `Гипотеза ${index + 1}`,
        summary: compactJoin([hypothesis.assumption, hypothesis.choiceLink, hypothesis.confirms, hypothesis.refutes]),
      })),
    });
  }, [
    acceptedChoice,
    actions,
    capabilities,
    choice,
    guidingPolicy,
    hypotheses,
    projectId,
    strategicQuestion,
    tradeOffs,
    winningAspiration,
  ]);

  const aspiration = winningAspiration.trim().toLowerCase();
  const aspirationWords = aspiration ? aspiration.split(/\s+/).length : 0;
  const aspirationTaskOnly = /^(сделать|выполнить|запустить|внедрить|создать|построить|реализовать|поучаствовать|принять участие)\b/.test(aspiration) && aspirationWords <= 4;
  const aspirationMoneyOnly = /(деньг|прибыл|выручк|доход|оборот|маржа)/.test(aspiration) && aspirationWords <= 4;
  const aspirationLinkedToClientResult = hasText(aspiration) && hasText(choice.howValue) && (results.items.length > 0 || hasText(results.expectedState));

  const validationChecks = [
    ['выбор отвечает на Диагноз', diagnosisSnapshot.keyChallenge || choice.howDiagnosisFit],
    ['выбор связан с миссией', mission.expectedState],
    ['выбор ведет к критериям результата', results.expectedState],
    ['winning aspiration не сведён к участию / задаче', hasText(aspiration) && !aspirationTaskOnly ? 'yes' : ''],
    ['winning aspiration не сведён только к деньгам', hasText(aspiration) && !aspirationMoneyOnly ? 'yes' : ''],
    ['winning aspiration связан с клиентом и результатом', aspirationLinkedToClientResult ? 'yes' : ''],
    ['выбрано where to play', choice.whereClient || choice.whereProcess],
    ['выбрано how to win', choice.howApproach],
    ['указаны capabilities', capabilities.some(item => hasText(item.competency)) ? 'yes' : ''],
    ['указаны management systems', choice.managementMetrics || choice.managementRhythm || choice.dataSystem],
    ['указано, что не делаем', tradeOffs.some(item => hasText(item.refusal)) ? 'yes' : ''],
    ['есть согласованные действия', actions.some(item => hasText(item.action)) ? 'yes' : ''],
    ['есть ресурсные обязательства', alternatives.some(item => hasText(item.resourceCommitments)) || actions.some(item => hasText(item.resource)) ? 'yes' : ''],
    ['ограничения не нарушены', choice.whereExcluded || alternatives.some(item => item.constraints.length) ? 'yes' : ''],
    ['сохраняемое ядро не разрушено', alternatives.some(item => item.preserveRisk.length) || preserve.expectedState ? 'yes' : ''],
  ];
  const completedChecks = validationChecks.filter(([, value]) => hasText(String(value))).length;
  const autoStatus = completedChecks === validationChecks.length ? 'Валидно' : completedChecks >= 6 ? 'Заполнено частично' : 'Не заполнено';

  function updateChoice(patch: Partial<StrategicChoiceState>) {
    setChoice(current => ({ ...current, ...patch }));
  }

  function updateCapability(id: number, patch: Partial<CapabilityCard>) {
    setCapabilities(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function updateAlternative(id: number, patch: Partial<AlternativeCard>) {
    setAlternatives(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function toggleAlternativeValue(id: number, field: 'capabilities' | 'constraints' | 'preserveRisk', value: string) {
    setAlternatives(current => current.map(item => {
      if (item.id !== id) return item;
      const values = item[field].includes(value) ? item[field].filter(option => option !== value) : [...item[field], value];
      return { ...item, [field]: values };
    }));
  }

  function updateTradeOff(id: number, patch: Partial<TradeOffCard>) {
    setTradeOffs(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function updateAction(id: number, patch: Partial<ActionCard>) {
    setActions(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  function updateHypothesis(id: number, patch: Partial<HypothesisCard>) {
    setHypotheses(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  return (
    <div className="project-theory project-strategy">
      <section className="project-theory-hero">
        <div>
          <div className="project-panel-title">Стратегический выбор проекта</div>
          <h2>Выбор способа преодолеть диагноз и сфокусировать ресурсы</h2>
          <p>Экран связывает Диагноз с Теорией проекта и превращает главное препятствие в where to play, how to win, capabilities, systems, trade-offs и coherent actions.</p>
        </div>
        <label className="project-theory-status">
          <span>Статус проверки</span>
          <select className="form-select" value={choice.status || autoStatus} onChange={event => updateChoice({ status: event.target.value })}>
            {statusOptions.map(option => <option key={option}>{option}</option>)}
          </select>
          <small>{completedChecks} из {validationChecks.length} проверок закрыто</small>
        </label>
      </section>

      <StrategicSection number="0-1" title="Связи с Диагнозом и Теорией проекта" note="Стратегический выбор должен отвечать диагнозу и не отрываться от миссии, результатов, ограничений и сохраняемого ядра.">
        <div className="project-strategy-source-grid">
          <div className="project-strategy-source-card">
            <b>Диагноз</b>
            <span>Ключевой вызов</span>
            <strong>{diagnosisSnapshot.keyChallenge || diagnosisSnapshot.finalStatement || 'Сначала заполните экран Диагноз'}</strong>
            <span>Главное препятствие</span>
            <em>{diagnosisSnapshot.obstacleType || 'Не указано'}</em>
            <span>Ограничивающий фактор</span>
            <em>{diagnosisSnapshot.limitingFactor || 'Не указан'}</em>
            <span>Симптомы</span>
            <em>{diagnosisSnapshot.symptoms.map(item => item.label).filter(Boolean).join(', ') || 'Не указаны'}</em>
            <span>Подтверждающие факты</span>
            <em>{diagnosisSnapshot.facts.map(item => item.label).filter(Boolean).join(', ') || 'Не указаны'}</em>
            <span>Альтернативные объяснения</span>
            <em>{diagnosisSnapshot.alternatives.map(item => item.label).filter(Boolean).join(', ') || 'Не указаны'}</em>
            <span>Последствия без изменений</span>
            <em>{diagnosisSnapshot.consequences.map(item => item.label).filter(Boolean).join(', ') || 'Не указаны'}</em>
            <span>Вывод для стратегического выбора</span>
            <em>{diagnosisSnapshot.strategicConclusion || 'Не указан'}</em>
          </div>
          <div className="project-strategy-source-card">
            <b>Теория проекта</b>
            {[mission, stakeholder, results, competencies, constraints, quality, preserve].map(block => (
              <div className="project-strategy-source-line" key={block.id}>
                <span>{block.title}</span>
                <em>{block.items[0]?.label || block.expectedState}</em>
              </div>
            ))}
          </div>
        </div>
      </StrategicSection>

      <StrategicSection number="2-3" title="Стратегический вопрос и выигрыш" note="Формулируем, какой подход выбираем, чтобы преодолеть препятствие из Диагноза и достичь результата из Теории проекта.">
        <div className="project-theory-grid two">
          <TextField label="2. Стратегический вопрос" value={strategicQuestion} onChange={value => updateChoice({ strategicQuestion: value })} multiline />
          <TextField label="3. Winning aspiration / что считается выигрышем" value={winningAspiration} onChange={value => updateChoice({ winningAspiration: value })} multiline />
        </div>
      </StrategicSection>

      <StrategicSection number="4-6" title="Where to play и How to win" note="Выбор должен явно указать, где играем, как выигрываем и почему этот способ отвечает диагнозу.">
        <div className="project-theory-grid two">
          <SelectField label="4. Выбранный клиент / сегмент" options={stakeholderOptions} value={choice.whereClient} onChange={value => updateChoice({ whereClient: value })} />
          <TextField label="4. География / зона действия" value={choice.whereGeography} onChange={value => updateChoice({ whereGeography: value })} />
          <TextField label="4. Продукт / услуга / функция" value={choice.whereProduct} onChange={value => updateChoice({ whereProduct: value })} />
          <TextField label="4. Процесс / участок системы" value={choice.whereProcess} onChange={value => updateChoice({ whereProcess: value })} />
          <TextField label="4. Что входит в выбор" value={choice.whereIncluded} onChange={value => updateChoice({ whereIncluded: value })} multiline />
          <TextField label="4. Что сознательно не входит" value={choice.whereExcluded} onChange={value => updateChoice({ whereExcluded: value })} multiline />
          <TextField label="5. Способ победы / подход" value={choice.howApproach} onChange={value => updateChoice({ howApproach: value })} multiline />
          <TextField label="5. Почему способ отвечает Диагнозу" value={choice.howDiagnosisFit} onChange={value => updateChoice({ howDiagnosisFit: value })} multiline />
          <TextField label="5. Ценность для клиента / выгодоприобретателя" value={choice.howValue} onChange={value => updateChoice({ howValue: value })} multiline />
          <TextField label="5. За счет чего появляется преимущество" value={choice.howAdvantage} onChange={value => updateChoice({ howAdvantage: value })} multiline />
          <TextField label="5. Что должно измениться в системе" value={choice.howSystemChange} onChange={value => updateChoice({ howSystemChange: value })} multiline />
          <TextField label="5. Почему лучше альтернатив" value={choice.howBetterThanAlternatives} onChange={value => updateChoice({ howBetterThanAlternatives: value })} multiline />
          <SelectField label="6. Тип способа выигрыша" options={winTypeOptions} value={choice.winType} onChange={value => updateChoice({ winType: value })} />
        </div>
      </StrategicSection>

      <StrategicSection number="7-8" title="Capabilities и Management systems" note="Фиксируем способности и управленческие системы, без которых выбор не будет реализуемым.">
        <div className="project-diagnosis-split">
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">Capabilities</div>
            {capabilities.map((capability, index) => (
              <div className="project-theory-card" key={capability.id}>
                <div className="project-theory-card-title">
                  <input className="form-input project-card-name-input" placeholder={`Способность ${index + 1}`} value={capability.name} onChange={event => updateCapability(capability.id, { name: event.target.value })} />
                </div>
                <div className="project-theory-grid two">
                  <SelectField label="Необходимая компетенция" options={competencyOptions} value={capability.competency} onChange={value => updateCapability(capability.id, { competency: value })} />
                  <TextField label="Текущий уровень" value={capability.currentLevel} onChange={value => updateCapability(capability.id, { currentLevel: value })} />
                  <TextField label="Требуемый уровень" value={capability.requiredLevel} onChange={value => updateCapability(capability.id, { requiredLevel: value })} />
                  <TextField label="Разрыв" value={capability.gap} onChange={value => updateCapability(capability.id, { gap: value })} />
                  <TextField label="Что нужно создать / усилить" value={capability.strengthen} onChange={value => updateCapability(capability.id, { strengthen: value })} multiline />
                  <TextField label="Что привлечь извне" value={capability.external} onChange={value => updateCapability(capability.id, { external: value })} multiline />
                </div>
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setCapabilities(current => [...current, createCapability(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить capability
            </button>
          </div>

          <div className="project-theory-card">
            <div className="project-theory-card-title">Management systems</div>
            <div className="project-theory-grid two">
              <TextField label="Метрики / KPI" value={choice.managementMetrics} onChange={value => updateChoice({ managementMetrics: value })} multiline />
              <TextField label="Управленческий ритм" value={choice.managementRhythm} onChange={value => updateChoice({ managementRhythm: value })} multiline />
              <TextField label="Владельцы решений" value={choice.decisionOwners} onChange={value => updateChoice({ decisionOwners: value })} />
              <TextField label="Отчетность" value={choice.reporting} onChange={value => updateChoice({ reporting: value })} multiline />
              <TextField label="Процесс контроля" value={choice.controlProcess} onChange={value => updateChoice({ controlProcess: value })} multiline />
              <TextField label="Система данных" value={choice.dataSystem} onChange={value => updateChoice({ dataSystem: value })} multiline />
              <TextField label="Распределение ресурсов" value={choice.resourceAllocation} onChange={value => updateChoice({ resourceAllocation: value })} multiline />
              <TextField label="Механизм пересмотра выбора" value={choice.reviewMechanism} onChange={value => updateChoice({ reviewMechanism: value })} multiline />
            </div>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection number="9-10" title="Альтернативы выбора" note="Сравниваем выбранный подход с альтернативами и обязательной альтернативой ничего не делать.">
        <div className="project-theory-repeater">
          {alternatives.map((alternative, index) => (
            <div className="project-theory-card" key={alternative.id}>
              <div className="project-theory-card-head">
                <div className="project-theory-card-title">Альтернатива {index + 1}</div>
                <span className="project-theory-status-badge">{alternative.status}</span>
              </div>
              <div className="project-theory-grid two">
                <TextField label="Название альтернативы" value={alternative.name} onChange={value => updateAlternative(alternative.id, { name: value })} />
                <SelectField label="Статус альтернативы" options={alternativeStatusOptions} value={alternative.status} onChange={value => updateAlternative(alternative.id, { status: value })} />
                <TextField label="Как отвечает на Диагноз" value={alternative.diagnosisFit} onChange={value => updateAlternative(alternative.id, { diagnosisFit: value })} multiline />
                <TextField label="Where to play альтернативы" value={alternative.whereToPlay} onChange={value => updateAlternative(alternative.id, { whereToPlay: value })} multiline />
                <TextField label="How to win альтернативы" value={alternative.howToWin} onChange={value => updateAlternative(alternative.id, { howToWin: value })} multiline />
                <TextField label="Management systems" value={alternative.managementSystems} onChange={value => updateAlternative(alternative.id, { managementSystems: value })} multiline />
                <TextField label="Resource commitments" value={alternative.resourceCommitments} onChange={value => updateAlternative(alternative.id, { resourceCommitments: value })} multiline />
                <TextField label="Что придется не делать" value={alternative.whatNotToDo} onChange={value => updateAlternative(alternative.id, { whatNotToDo: value })} multiline />
                <Checklist label="Нужные capabilities" options={competencyOptions} values={alternative.capabilities} onToggle={value => toggleAlternativeValue(alternative.id, 'capabilities', value)} />
                <Checklist label="Ограничения и риски" options={constraintOptions} values={alternative.constraints} onToggle={value => toggleAlternativeValue(alternative.id, 'constraints', value)} />
                <Checklist label="Что может повредить" options={preserveOptions} values={alternative.preserveRisk} onToggle={value => toggleAlternativeValue(alternative.id, 'preserveRisk', value)} />
              </div>
            </div>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setAlternatives(current => [...current, createAlternative(current.length + 1)])}>
            <Icon name="plus" size={16} />
            Добавить альтернативу
          </button>
          <div className="project-theory-card">
            <div className="project-theory-card-title">10. Альтернатива ничего не делать</div>
            <div className="project-theory-grid two">
              <TextField label="Что произойдет без изменений" value={choice.noActionWhatHappens || diagnosisSnapshot.consequences.map(item => item.summary).join('\n')} onChange={value => updateChoice({ noActionWhatHappens: value })} multiline />
              <SelectField label="Какой результат не будет достигнут" options={resultOptions} value={choice.noActionMissedResult} onChange={value => updateChoice({ noActionMissedResult: value })} />
              <SelectField label="Кто понесет ущерб" options={stakeholderOptions} value={choice.noActionAffected} onChange={value => updateChoice({ noActionAffected: value })} />
              <TextField label="Почему отказ допустим / недопустим" value={choice.noActionVerdict} onChange={value => updateChoice({ noActionVerdict: value })} multiline />
            </div>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection number="11-14" title="Принятый выбор, trade-offs и действия" note="Фиксируем выбранную стратегическую позицию, что не делаем, guiding policy и согласованные действия.">
        <div className="project-theory-grid two">
          <SelectField label="11. Выбранная альтернатива" options={alternatives.map((alternative, index) => alternative.name || `Альтернатива ${index + 1}`)} value={choice.selectedAlternative} onChange={value => updateChoice({ selectedAlternative: value })} />
          <TextField label="11. Принятый стратегический выбор" value={acceptedChoice} onChange={value => updateChoice({ acceptedChoice: value })} multiline />
          <TextField label="13. Guiding policy" value={guidingPolicy} onChange={value => updateChoice({ guidingPolicy: value })} multiline className="full" />
        </div>
        <div className="project-diagnosis-split">
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">12. Trade-offs / что не делаем</div>
            {tradeOffs.map((tradeOff, index) => (
              <div className="project-theory-card" key={tradeOff.id}>
                <div className="project-theory-card-title">
                  <input className="form-input project-card-name-input" placeholder={`Отказ ${index + 1}`} value={tradeOff.name} onChange={event => updateTradeOff(tradeOff.id, { name: event.target.value })} />
                </div>
                <div className="project-theory-grid two">
                  <TextField label="От чего отказываемся" value={tradeOff.refusal} onChange={value => updateTradeOff(tradeOff.id, { refusal: value })} />
                  <TextField label="Почему отказываемся" value={tradeOff.reason} onChange={value => updateTradeOff(tradeOff.id, { reason: value })} />
                  <TextField label="Какой ресурс высвобождается" value={tradeOff.releasedResource} onChange={value => updateTradeOff(tradeOff.id, { releasedResource: value })} />
                  <TextField label="Какой риск снижается" value={tradeOff.reducedRisk} onChange={value => updateTradeOff(tradeOff.id, { reducedRisk: value })} />
                  <TextField label="Кто подтверждает отказ" value={tradeOff.approver} onChange={value => updateTradeOff(tradeOff.id, { approver: value })} />
                </div>
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setTradeOffs(current => [...current, createTradeOff(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить отказ
            </button>
          </div>
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">14. Coherent actions</div>
            {actions.map((action, index) => (
              <div className="project-theory-card" key={action.id}>
                <div className="project-theory-card-title">
                  <input className="form-input project-card-name-input" placeholder={`Действие ${index + 1}`} value={action.name} onChange={event => updateAction(action.id, { name: event.target.value })} />
                </div>
                <div className="project-theory-grid two">
                  <TextField label="Действие" value={action.action} onChange={value => updateAction(action.id, { action: value })} />
                  <TextField label="Какой выбор поддерживает" value={action.supportsChoice} onChange={value => updateAction(action.id, { supportsChoice: value })} />
                  <TextField label="Какой ресурс требуется" value={action.resource} onChange={value => updateAction(action.id, { resource: value })} />
                  <TextField label="Владелец" value={action.owner} onChange={value => updateAction(action.id, { owner: value })} />
                  <TextField label="Срок" value={action.deadline} onChange={value => updateAction(action.id, { deadline: value })} />
                  <TextField label="Зависимость" value={action.dependency} onChange={value => updateAction(action.id, { dependency: value })} />
                  <TextField label="Связь с будущей инициативой / задачей" value={action.futureLink} onChange={value => updateAction(action.id, { futureLink: value })} />
                </div>
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setActions(current => [...current, createAction(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить действие
            </button>
          </div>
        </div>
      </StrategicSection>

      <StrategicSection number="16-17" title="Гипотезы и выход в следующий экран" note="Непроверенные предположения из выбора передаются на экран Гипотезы вместе с выбранной стратегической позицией.">
        <div className="project-theory-repeater">
          {hypotheses.map((hypothesis, index) => (
            <div className="project-theory-card" key={hypothesis.id}>
              <div className="project-theory-card-title">
                <input className="form-input project-card-name-input" placeholder={`Гипотеза ${index + 1}`} value={hypothesis.name} onChange={event => updateHypothesis(hypothesis.id, { name: event.target.value })} />
              </div>
              <div className="project-theory-grid two">
                <TextField label="Предположение" value={hypothesis.assumption} onChange={value => updateHypothesis(hypothesis.id, { assumption: value })} multiline />
                <TextField label="На какой выбор влияет" value={hypothesis.choiceLink} onChange={value => updateHypothesis(hypothesis.id, { choiceLink: value })} />
                <TextField label="Что подтвердит" value={hypothesis.confirms} onChange={value => updateHypothesis(hypothesis.id, { confirms: value })} multiline />
                <TextField label="Что опровергнет" value={hypothesis.refutes} onChange={value => updateHypothesis(hypothesis.id, { refutes: value })} multiline />
              </div>
            </div>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setHypotheses(current => [...current, createHypothesis(current.length + 1)])}>
            <Icon name="plus" size={16} />
            Добавить гипотезу
          </button>
          <div className="project-strategy-output">
            <b>Выход</b>
            <span>{acceptedChoice}</span>
            <span>Where to play: {compactJoin([choice.whereClient, choice.whereGeography, choice.whereProduct, choice.whereProcess]) || 'не заполнено'}</span>
            <span>How to win: {choice.howApproach || 'не заполнено'}</span>
            <span>Trade-offs: {tradeOffs.map(item => item.refusal).filter(Boolean).join(', ') || 'не заполнено'}</span>
          </div>
        </div>
      </StrategicSection>

      <section className="project-theory-validation">
        <div>
          <div className="project-panel-title">18. Методологическая проверка</div>
          <h3>{autoStatus}</h3>
          <p>Выбор валиден, когда отвечает диагнозу, связан с теорией проекта, указывает where/how to win, capabilities, systems, trade-offs и согласованные действия.</p>
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
