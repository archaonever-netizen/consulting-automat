import { useEffect, useMemo, useState, type ReactNode } from 'react';
import DraftCard from './DraftCard';
import Icon from '../Icon';
import ProjectDisclosure from './ProjectDisclosure';
import { focusKey } from './projectCanvasFocus';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectStrategicChoiceSnapshot, writeProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import ProjectLinkField from './ProjectLinkField';
import { crossRefOptions } from './projectCrossRefs';
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
  diagnosisFitRef: string; // составной id связанного элемента Диагноза (прямая связь)
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
  supportsChoiceRef: string;
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
  choiceLinkRef: string;
  confirms: string;
  refutes: string;
};

const statusOptions = ['Не заполнено', 'Заполнено частично', 'Есть методологическая ошибка', 'Валидно'];
const winTypeOptions = ['выигрыш через более низкую стоимость', 'выигрыш через дифференциацию / уникальную ценность'];
const alternativeStatusOptions = ['выбрана', 'отклонена', 'требует проверки', 'оставить как резерв'];

export const createChoice = (): StrategicChoiceState => ({
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

export const createCapability = (id: number, competency = ''): CapabilityCard => ({
  id,
  name: '',
  competency,
  currentLevel: '',
  requiredLevel: '',
  gap: '',
  strengthen: '',
  external: '',
});

export const createAlternative = (id: number): AlternativeCard => ({
  id,
  name: '',
  diagnosisFit: '',
  diagnosisFitRef: '',
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

export const createTradeOff = (id: number): TradeOffCard => ({
  id,
  name: '',
  refusal: '',
  reason: '',
  releasedResource: '',
  reducedRisk: '',
  approver: '',
});

export const createAction = (id: number): ActionCard => ({
  id,
  name: '',
  action: '',
  supportsChoice: '',
  supportsChoiceRef: '',
  resource: '',
  owner: '',
  deadline: '',
  dependency: '',
  futureLink: '',
});

export const createHypothesis = (id: number): HypothesisCard => ({
  id,
  name: '',
  assumption: '',
  choiceLink: '',
  choiceLinkRef: '',
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

// Карточка-источник «Теория проекта»: показываем все значения блока, а не только первое.
// У миссии в items[0].label лежит декоративный заголовок «Формулировка миссии»,
// поэтому для неё берём expectedState — там реальный текст миссии.
function theoryBlockSummary(block: { id: ProjectTheoryBlockId; items: Array<{ label: string }>; expectedState: string }) {
  if (block.id === 'mission') {
    return block.expectedState || '—';
  }
  return block.items.map(item => item.label).filter(Boolean).join(', ') || block.expectedState || '—';
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

type StrategicChoiceForm = {
  choice: StrategicChoiceState;
  capabilities: CapabilityCard[];
  alternatives: AlternativeCard[];
  tradeOffs: TradeOffCard[];
  actions: ActionCard[];
  hypotheses: HypothesisCard[];
};

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
  // Опции прямой связи альтернативы с элементом Диагноза (симптомы) — реальные элементы по id.
  const diagnosisSymptomOptions = useMemo(() => crossRefOptions(projectId, 'diagnosis', 'symptoms'), [projectId]);
  // Опции связи действия/гипотезы с альтернативой (реальные альтернативы по id).
  const alternativeOptions = useMemo(() => crossRefOptions(projectId, 'strategic-choice', 'alternatives'), [projectId]);
  const resultOptions = itemLabels(results.items, 'Сначала заполните критерии результата в Теории проекта');
  const stakeholderOptions = itemLabels(stakeholder.items, 'Сначала заполните выгодоприобретателей в Теории проекта');

  const savedForm = useMemo(() => readProjectStrategicChoiceSnapshot(projectId)?.form as StrategicChoiceForm | undefined, [projectId]);
  const [choice, setChoice] = useState<StrategicChoiceState>(() => savedForm?.choice ?? createChoice());
  const [capabilities, setCapabilities] = useState<CapabilityCard[]>(() => savedForm?.capabilities ?? [createCapability(1, competencyOptions[0] || '')]);
  const [alternatives, setAlternatives] = useState<AlternativeCard[]>(() => savedForm?.alternatives ?? [createAlternative(1)]);
  const [tradeOffs, setTradeOffs] = useState<TradeOffCard[]>(() => savedForm?.tradeOffs ?? [createTradeOff(1)]);
  const [actions, setActions] = useState<ActionCard[]>(() => savedForm?.actions ?? [createAction(1)]);
  const [hypotheses, setHypotheses] = useState<HypothesisCard[]>(() => savedForm?.hypotheses ?? [createHypothesis(1)]);

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
    const timer = setTimeout(() => writeProjectStrategicChoiceSnapshot(projectId, {
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
      noActionConsequence: compactJoin([
        choice.noActionWhatHappens,
        choice.noActionMissedResult,
        choice.noActionAffected,
        choice.noActionVerdict,
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
      alternatives: alternatives.map((alternative, index) => ({
        id: String(alternative.id),
        label: alternative.name.trim() || alternative.diagnosisFit || `Альтернатива ${index + 1}`,
        summary: compactJoin([
          alternative.diagnosisFit,
          alternative.whereToPlay,
          alternative.howToWin,
          alternative.managementSystems,
          alternative.resourceCommitments,
          alternative.whatNotToDo,
          alternative.status,
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
      form: { choice, capabilities, alternatives, tradeOffs, actions, hypotheses } satisfies StrategicChoiceForm,
    }), 400);
    return () => clearTimeout(timer);
  }, [
    acceptedChoice,
    actions,
    alternatives,
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

      <ProjectDisclosure title="Контекст — связи с Диагнозом и Теорией проекта">
        <p className="project-disclosure-dependency">Стратегический выбор должен отвечать диагнозу и не отрываться от миссии, результатов, ограничений и сохраняемого ядра.</p>
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
                <em>{theoryBlockSummary(block)}</em>
              </div>
            ))}
          </div>
        </div>
      </ProjectDisclosure>

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
              <DraftCard
                key={capability.id}
                card={capability}
                focusId={focusKey('strategic-choice', 'capabilities', String(capability.id))}
                title={`Способность ${index + 1}`}
                onApply={next => setCapabilities(current => current.map(item => item.id === next.id ? next : item))}
              >
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название способности</span>
                      <input className="form-input" placeholder={`Способность ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <SelectField label="Необходимая компетенция" options={competencyOptions} value={draft.competency} onChange={value => patch({ competency: value })} />
                      <TextField label="Текущий уровень" value={draft.currentLevel} onChange={value => patch({ currentLevel: value })} />
                      <TextField label="Требуемый уровень" value={draft.requiredLevel} onChange={value => patch({ requiredLevel: value })} />
                      <TextField label="Разрыв" value={draft.gap} onChange={value => patch({ gap: value })} />
                      <TextField label="Что нужно создать / усилить" value={draft.strengthen} onChange={value => patch({ strengthen: value })} multiline />
                      <TextField label="Что привлечь извне" value={draft.external} onChange={value => patch({ external: value })} multiline />
                    </div>
                  </>
                )}
              </DraftCard>
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
            <DraftCard
              key={alternative.id}
              card={alternative}
              focusId={focusKey('strategic-choice', 'alternatives', String(alternative.id))}
              title={`Альтернатива ${index + 1}`}
              onApply={next => setAlternatives(current => current.map(item => item.id === next.id ? next : item))}
            >
              {(draft, patch) => {
                const toggleValue = (field: 'capabilities' | 'constraints' | 'preserveRisk', value: string) =>
                  patch({ [field]: draft[field].includes(value) ? draft[field].filter(option => option !== value) : [...draft[field], value] } as Partial<AlternativeCard>);
                return (
                  <div className="project-theory-grid two">
                    <TextField label="Название альтернативы" value={draft.name} onChange={value => patch({ name: value })} />
                    <SelectField label="Статус альтернативы" options={alternativeStatusOptions} value={draft.status} onChange={value => patch({ status: value })} />
                    <TextField label="Как отвечает на Диагноз" value={draft.diagnosisFit} onChange={value => patch({ diagnosisFit: value })} multiline />
                    <ProjectLinkField label="→ Связь: симптом Диагноза" value={draft.diagnosisFitRef} options={diagnosisSymptomOptions} onChange={value => patch({ diagnosisFitRef: value })} />
                    <TextField label="Where to play альтернативы" value={draft.whereToPlay} onChange={value => patch({ whereToPlay: value })} multiline />
                    <TextField label="How to win альтернативы" value={draft.howToWin} onChange={value => patch({ howToWin: value })} multiline />
                    <TextField label="Management systems" value={draft.managementSystems} onChange={value => patch({ managementSystems: value })} multiline />
                    <TextField label="Resource commitments" value={draft.resourceCommitments} onChange={value => patch({ resourceCommitments: value })} multiline />
                    <TextField label="Что придется не делать" value={draft.whatNotToDo} onChange={value => patch({ whatNotToDo: value })} multiline />
                    <Checklist label="Нужные capabilities" options={competencyOptions} values={draft.capabilities} onToggle={value => toggleValue('capabilities', value)} />
                    <Checklist label="Ограничения и риски" options={constraintOptions} values={draft.constraints} onToggle={value => toggleValue('constraints', value)} />
                    <Checklist label="Что может повредить" options={preserveOptions} values={draft.preserveRisk} onToggle={value => toggleValue('preserveRisk', value)} />
                  </div>
                );
              }}
            </DraftCard>
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
              <DraftCard
                key={tradeOff.id}
                card={tradeOff}
                focusId={focusKey('strategic-choice', 'tradeOffs', String(tradeOff.id))}
                title={`Отказ ${index + 1}`}
                onApply={next => setTradeOffs(current => current.map(item => item.id === next.id ? next : item))}
              >
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название отказа</span>
                      <input className="form-input" placeholder={`Отказ ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <TextField label="От чего отказываемся" value={draft.refusal} onChange={value => patch({ refusal: value })} />
                      <TextField label="Почему отказываемся" value={draft.reason} onChange={value => patch({ reason: value })} />
                      <TextField label="Какой ресурс высвобождается" value={draft.releasedResource} onChange={value => patch({ releasedResource: value })} />
                      <TextField label="Какой риск снижается" value={draft.reducedRisk} onChange={value => patch({ reducedRisk: value })} />
                      <TextField label="Кто подтверждает отказ" value={draft.approver} onChange={value => patch({ approver: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setTradeOffs(current => [...current, createTradeOff(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить отказ
            </button>
          </div>
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">14. Coherent actions</div>
            {actions.map((action, index) => (
              <DraftCard
                key={action.id}
                card={action}
                focusId={focusKey('strategic-choice', 'actions', String(action.id))}
                title={`Действие ${index + 1}`}
                onApply={next => setActions(current => current.map(item => item.id === next.id ? next : item))}
              >
                {(draft, patch) => (
                  <>
                    <label className="project-theory-field">
                      <span>Название действия</span>
                      <input className="form-input" placeholder={`Действие ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                    </label>
                    <div className="project-theory-grid two">
                      <TextField label="Действие" value={draft.action} onChange={value => patch({ action: value })} />
                      <TextField label="Какой выбор поддерживает" value={draft.supportsChoice} onChange={value => patch({ supportsChoice: value })} />
                      <ProjectLinkField label="→ Связь: стратегическая альтернатива" value={draft.supportsChoiceRef} options={alternativeOptions} onChange={value => patch({ supportsChoiceRef: value })} />
                      <TextField label="Какой ресурс требуется" value={draft.resource} onChange={value => patch({ resource: value })} />
                      <TextField label="Владелец" value={draft.owner} onChange={value => patch({ owner: value })} />
                      <TextField label="Срок" value={draft.deadline} onChange={value => patch({ deadline: value })} />
                      <TextField label="Зависимость" value={draft.dependency} onChange={value => patch({ dependency: value })} />
                      <TextField label="Связь с будущей инициативой / задачей" value={draft.futureLink} onChange={value => patch({ futureLink: value })} />
                    </div>
                  </>
                )}
              </DraftCard>
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
            <DraftCard
              key={hypothesis.id}
              card={hypothesis}
              focusId={focusKey('strategic-choice', 'hypotheses', String(hypothesis.id))}
              title={`Гипотеза ${index + 1}`}
              onApply={next => setHypotheses(current => current.map(item => item.id === next.id ? next : item))}
            >
              {(draft, patch) => (
                <>
                  <label className="project-theory-field">
                    <span>Название гипотезы</span>
                    <input className="form-input" placeholder={`Гипотеза ${index + 1}`} value={draft.name} onChange={event => patch({ name: event.target.value })} />
                  </label>
                  <div className="project-theory-grid two">
                    <TextField label="Предположение" value={draft.assumption} onChange={value => patch({ assumption: value })} multiline />
                    <TextField label="На какой выбор влияет" value={draft.choiceLink} onChange={value => patch({ choiceLink: value })} />
                    <ProjectLinkField label="→ Связь: стратегическая альтернатива" value={draft.choiceLinkRef} options={alternativeOptions} onChange={value => patch({ choiceLinkRef: value })} />
                    <TextField label="Что подтвердит" value={draft.confirms} onChange={value => patch({ confirms: value })} multiline />
                    <TextField label="Что опровергнет" value={draft.refutes} onChange={value => patch({ refutes: value })} multiline />
                  </div>
                </>
              )}
            </DraftCard>
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

      <ProjectDisclosure title="Проверка готовности" count={`${completedChecks} из ${validationChecks.length}`}>
        <p className="project-disclosure-dependency">Выбор валиден, когда отвечает диагнозу, связан с теорией проекта, указывает where/how to win, capabilities, systems, trade-offs и согласованные действия.</p>
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
      </ProjectDisclosure>
    </div>
  );
}

// Опции выпадающих списков — для видимости ИИ-Методологу (projectComplexCards → buildComplexEditable).
export { winTypeOptions, alternativeStatusOptions };
