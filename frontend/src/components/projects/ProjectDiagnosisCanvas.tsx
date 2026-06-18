import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Icon from '../Icon';
import { writeProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import {
  getFallbackProjectTheorySnapshot,
  readProjectTheorySnapshot,
  type ProjectTheoryBlockSnapshot,
  type ProjectTheorySnapshot,
} from './projectTheorySnapshot';

type DiagnosisField = 'areas';

type TheoryRelation = ProjectTheoryBlockSnapshot;

type DiagnosisState = {
  status: string;
  rawRequest: string;
  requestType: string;
  requestContext: string;
  areas: string[];
  keyChallenge: string;
  obstacleType: string;
  limitingFactor: string;
  scale: string;
  strategicConclusion: string;
  exclusions: string;
  finalStatement: string;
};

type GapCard = {
  id: number;
  theoryBlock: string;
  expectedState: string;
  observedReality: string;
  gap: string;
  confirmingFact: string;
  status: string;
};

type SymptomCard = {
  id: number;
  description: string;
  location: string;
  affected: string;
  frequency: string;
  relatedGap: string;
  dataSource: string;
};

type FactCard = {
  id: number;
  indicator: string;
  value: string;
  period: string;
  dataSource: string;
  reliability: string;
  confirms: string;
};

type AlternativeCard = {
  id: number;
  reason: string;
  confirms: string;
  refutes: string;
  status: string;
};

type VerificationCard = {
  id: number;
  subject: string;
  method: string;
  confirmFact: string;
  refuteFact: string;
  deadline: string;
  owner: string;
};

type ConsequenceCard = {
  id: number;
  deterioration: string;
  affected: string;
  timing: string;
  damage: string;
  source: string;
};

const statusOptions = ['Не заполнено', 'Заполнено частично', 'Есть методологическая ошибка', 'Валидно'];

const requestTypeOptions = [
  'Симптом',
  'Готовое решение клиента',
  'Желание / амбиция',
  'Проблема',
  'Ограничение',
  'Гипотеза',
];

const diagnosisAreaOptions = [
  'Финансы',
  'Клиенты',
  'Внутренние процессы',
  'Обучение и развитие',
  'Управленческая система',
  'Социальное воздействие / common good',
];

const obstacleTypeOptions = [
  'Неверно определен клиент / результат',
  'Нет ясного стратегического выбора',
  'Недостаточная компетенция',
  'Узкое место процесса',
  'Недостаток ресурсов',
  'Нет владельца / ответственности',
  'Нет системы контроля',
  'Конфликт ограничений',
  'Несогласованные действия',
  'Изменение внешней среды',
  'Слабая управленческая система',
];

const scaleOptions = ['Локальный', 'Межфункциональный', 'Системный', 'Стратегический'];

const dataSourceOptions = [
  'CRM',
  'Финансовый отчет',
  'Управленческий учет',
  'Операционный отчет',
  'HR-данные',
  'Клиентские жалобы',
  'Аудит процесса',
  'Интервью',
  'Документы',
  'Наблюдение',
];

const verificationMethodOptions = [
  'интервью',
  'анализ данных',
  'аудит процесса',
  'клиентский опрос',
  'пилот',
  'наблюдение',
  'сравнение периодов',
  'разбор кейсов',
];

const relationStatusOptions = ['Подтвержден', 'Требует проверки', 'Опровергнут', 'Недостаточно данных'];
const alternativeStatusOptions = ['требует проверки', 'подтверждено', 'опровергнуто'];
const reliabilityOptions = ['высокая', 'средняя', 'низкая'];

const fallbackTheoryRelations: TheoryRelation[] = getFallbackProjectTheorySnapshot(0).blocks;

const createDiagnosis = (): DiagnosisState => ({
  status: 'Не заполнено',
  rawRequest: '',
  requestType: '',
  requestContext: '',
  areas: [],
  keyChallenge: '',
  obstacleType: '',
  limitingFactor: '',
  scale: '',
  strategicConclusion: '',
  exclusions: '',
  finalStatement: '',
});

const createGapFromRelation = (relation: TheoryRelation, id: number): GapCard => ({
  id,
  theoryBlock: relation.id,
  expectedState: relation.expectedState || relation.fallbackExpectedState,
  observedReality: '',
  gap: '',
  confirmingFact: '',
  status: 'Требует проверки',
});

const createGapsFromRelations = (relations: TheoryRelation[]) => (
  relations.length ? relations : fallbackTheoryRelations
).map((relation, index) => createGapFromRelation(relation, index + 1));

const createSymptom = (id: number): SymptomCard => ({
  id,
  description: '',
  location: '',
  affected: '',
  frequency: '',
  relatedGap: '',
  dataSource: '',
});

const createFact = (id: number): FactCard => ({
  id,
  indicator: '',
  value: '',
  period: '',
  dataSource: '',
  reliability: '',
  confirms: '',
});

const createAlternative = (id: number): AlternativeCard => ({
  id,
  reason: '',
  confirms: '',
  refutes: '',
  status: 'требует проверки',
});

const createVerification = (id: number): VerificationCard => ({
  id,
  subject: '',
  method: '',
  confirmFact: '',
  refuteFact: '',
  deadline: '',
  owner: '',
});

const createConsequence = (id: number): ConsequenceCard => ({
  id,
  deterioration: '',
  affected: '',
  timing: '',
  damage: '',
  source: '',
});

function getRelation(relations: TheoryRelation[], id: string) {
  return relations.find(relation => relation.id === id) || relations[0] || fallbackTheoryRelations[0];
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function compactJoin(values: Array<string | undefined>) {
  return values.map(value => value?.trim()).filter(Boolean).join('; ');
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
  className = '',
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`project-theory-field ${className}`.trim()}>
      <span>{label}</span>
      <select className="form-select" value={value} onChange={event => onChange(event.target.value)}>
        <option value="">Выберите значение</option>
        {options.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function MultiSelectChecklist({
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

function DiagnosisSection({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
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

interface ProjectDiagnosisCanvasProps {
  projectId: number;
}

export default function ProjectDiagnosisCanvas({ projectId }: ProjectDiagnosisCanvasProps) {
  const theorySnapshot = useMemo<ProjectTheorySnapshot>(
    () => readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId),
    [projectId],
  );
  const theoryRelations = theorySnapshot.blocks.length ? theorySnapshot.blocks : fallbackTheoryRelations;
  const [diagnosis, setDiagnosis] = useState<DiagnosisState>(createDiagnosis);
  const [gaps, setGaps] = useState<GapCard[]>(() => createGapsFromRelations(theoryRelations));
  const [symptoms, setSymptoms] = useState<SymptomCard[]>([createSymptom(1)]);
  const [facts, setFacts] = useState<FactCard[]>([createFact(1)]);
  const [alternatives, setAlternatives] = useState<AlternativeCard[]>([createAlternative(1)]);
  const [verifications, setVerifications] = useState<VerificationCard[]>([createVerification(1)]);
  const [consequences, setConsequences] = useState<ConsequenceCard[]>([createConsequence(1)]);

  const gapNames = gaps.map((gap, index) => `${index + 1}. ${getRelation(theoryRelations, gap.theoryBlock).title}`);
  const symptomNames = symptoms.map((symptom, index) => symptom.description || `Симптом ${index + 1}`);
  const factNames = facts.map((fact, index) => fact.indicator || `Факт ${index + 1}`);

  const generatedFinalStatement = useMemo(() => {
    const symptomText = symptoms.map(symptom => symptom.description).filter(Boolean).slice(0, 2).join('; ') || '[симптомы]';
    const factText = facts.map(fact => fact.indicator || fact.value).filter(Boolean).slice(0, 2).join('; ') || '[факты]';
    const consequenceText = consequences.map(consequence => consequence.deterioration).filter(Boolean).slice(0, 1).join('; ') || '[последствия]';

    return `Запрос клиента возник потому, что [система / функция / команда] не достигает [критерий результата из Теории проекта]. Это проявляется в ${symptomText} и подтверждается ${factText}. Главное препятствие: ${diagnosis.keyChallenge || '[ключевой вызов]'}. Ограничивающий фактор: ${diagnosis.limitingFactor || '[ограничение]'}. Если ничего не менять, возникнет ${consequenceText}. Следующий стратегический выбор должен ответить на вопрос: ${diagnosis.strategicConclusion || '[вывод]'}.`;
  }, [consequences, diagnosis.keyChallenge, diagnosis.limitingFactor, diagnosis.strategicConclusion, facts, symptoms]);

  useEffect(() => {
    writeProjectDiagnosisSnapshot(projectId, {
      projectId,
      updatedAt: new Date().toISOString(),
      rawRequest: diagnosis.rawRequest,
      requestType: diagnosis.requestType,
      requestContext: diagnosis.requestContext,
      areas: diagnosis.areas,
      keyChallenge: diagnosis.keyChallenge,
      obstacleType: diagnosis.obstacleType,
      limitingFactor: diagnosis.limitingFactor,
      scale: diagnosis.scale,
      strategicConclusion: diagnosis.strategicConclusion,
      exclusions: diagnosis.exclusions,
      finalStatement: diagnosis.finalStatement || generatedFinalStatement,
      gaps: gaps.map((gap, index) => ({
        id: String(gap.id),
        label: `${index + 1}. ${getRelation(theoryRelations, gap.theoryBlock).title}`,
        summary: compactJoin([gap.expectedState, gap.observedReality, gap.gap, gap.status]),
      })),
      symptoms: symptoms.map((symptom, index) => ({
        id: String(symptom.id),
        label: symptom.description || `Симптом ${index + 1}`,
        summary: compactJoin([symptom.description, symptom.location, symptom.affected, symptom.frequency, symptom.dataSource]),
      })),
      facts: facts.map((fact, index) => ({
        id: String(fact.id),
        label: fact.indicator || `Факт ${index + 1}`,
        summary: compactJoin([fact.indicator, fact.value, fact.period, fact.dataSource, fact.reliability, fact.confirms]),
      })),
      alternatives: alternatives.map((alternative, index) => ({
        id: String(alternative.id),
        label: alternative.reason || `Альтернативное объяснение ${index + 1}`,
        summary: compactJoin([alternative.reason, alternative.confirms, alternative.refutes, alternative.status]),
      })),
      consequences: consequences.map((consequence, index) => ({
        id: String(consequence.id),
        label: consequence.deterioration || `Последствие ${index + 1}`,
        summary: compactJoin([consequence.deterioration, consequence.affected, consequence.timing, consequence.damage, consequence.source]),
      })),
    });
  }, [
    alternatives,
    consequences,
    diagnosis,
    facts,
    gaps,
    generatedFinalStatement,
    projectId,
    symptoms,
    theoryRelations,
  ]);

  const validationChecks = [
    ['сырой запрос зафиксирован', diagnosis.rawRequest],
    ['тип запроса определен', diagnosis.requestType],
    ['диагноз связан с Теорией проекта', gaps.some(gap => hasText(gap.observedReality) || hasText(gap.gap)) ? 'yes' : ''],
    ['есть минимум один разрыв между Теорией проекта и реальностью', gaps.some(gap => hasText(gap.gap)) ? 'yes' : ''],
    ['симптомы отделены от проблемы', symptoms.some(symptom => hasText(symptom.description)) ? 'yes' : ''],
    ['симптомы подтверждены фактами', facts.some(fact => hasText(fact.confirms) || hasText(fact.indicator)) ? 'yes' : ''],
    ['указаны источники данных', facts.some(fact => hasText(fact.dataSource)) || symptoms.some(symptom => hasText(symptom.dataSource)) ? 'yes' : ''],
    ['сформулирован ключевой вызов', diagnosis.keyChallenge],
    ['указан тип ключевого препятствия', diagnosis.obstacleType],
    ['указан ограничивающий фактор', diagnosis.limitingFactor],
    ['есть альтернативные объяснения', alternatives.some(alternative => hasText(alternative.reason)) ? 'yes' : ''],
    ['есть проверка диагноза', verifications.some(verification => hasText(verification.subject)) ? 'yes' : ''],
    ['есть последствия без изменений', consequences.some(consequence => hasText(consequence.deterioration)) ? 'yes' : ''],
    ['есть вывод для стратегического выбора', diagnosis.strategicConclusion],
  ];
  const completedChecks = validationChecks.filter(([, value]) => hasText(String(value))).length;
  const autoStatus = completedChecks === validationChecks.length ? 'Валидно' : completedChecks >= 8 ? 'Заполнено частично' : 'Не заполнено';

  function updateDiagnosis(patch: Partial<DiagnosisState>) {
    setDiagnosis(current => ({ ...current, ...patch }));
  }

  function toggleDiagnosisValue(field: DiagnosisField, value: string) {
    setDiagnosis(current => ({
      ...current,
      [field]: current[field].includes(value)
        ? current[field].filter(item => item !== value)
        : [...current[field], value],
    }));
  }

  function updateGap(id: number, patch: Partial<GapCard>) {
    setGaps(current => current.map(gap => {
      if (gap.id !== id) return gap;
      const next = { ...gap, ...patch };
      if (patch.theoryBlock) {
        const relation = getRelation(theoryRelations, patch.theoryBlock);
        next.expectedState = relation.expectedState || relation.fallbackExpectedState;
      }
      return next;
    }));
  }

  function updateSymptom(id: number, patch: Partial<SymptomCard>) {
    setSymptoms(current => current.map(symptom => symptom.id === id ? { ...symptom, ...patch } : symptom));
  }

  function updateFact(id: number, patch: Partial<FactCard>) {
    setFacts(current => current.map(fact => fact.id === id ? { ...fact, ...patch } : fact));
  }

  function updateAlternative(id: number, patch: Partial<AlternativeCard>) {
    setAlternatives(current => current.map(alternative => alternative.id === id ? { ...alternative, ...patch } : alternative));
  }

  function updateVerification(id: number, patch: Partial<VerificationCard>) {
    setVerifications(current => current.map(verification => verification.id === id ? { ...verification, ...patch } : verification));
  }

  function updateConsequence(id: number, patch: Partial<ConsequenceCard>) {
    setConsequences(current => current.map(consequence => consequence.id === id ? { ...consequence, ...patch } : consequence));
  }

  return (
    <div className="project-theory project-diagnosis">
      <section className="project-theory-hero">
        <div>
          <div className="project-panel-title">Диагноз проекта</div>
          <h2>Почему текущая реальность не позволяет проекту создать заявленную ценность</h2>
          <p>Экран проверяет каждый блок Теории проекта через факты, симптомы и разрывы между ожидаемым состоянием и наблюдаемой реальностью.</p>
        </div>
        <label className="project-theory-status">
          <span>Статус заполнения</span>
          <select className="form-select" value={diagnosis.status || autoStatus} onChange={event => updateDiagnosis({ status: event.target.value })}>
            {statusOptions.map(option => <option key={option}>{option}</option>)}
          </select>
          <small>{completedChecks} из {validationChecks.length} проверок закрыто</small>
        </label>
      </section>

      <DiagnosisSection number="0" title="Связь с экраном Теория проекта" note="Диагноз проверяет, что мешает каждому блоку Теории проекта быть правдой в текущей реальности.">
        <div className="project-diagnosis-relations">
          {theoryRelations.map(relation => (
            <div className="project-diagnosis-relation" key={relation.id}>
              <b>{relation.title}</b>
              <span>{relation.diagnosisQuestion}</span>
              <strong>{relation.expectedState || relation.fallbackExpectedState}</strong>
              {relation.items.length > 0 && (
                <div className="project-diagnosis-relation-items">
                  {relation.items.slice(0, 3).map(item => (
                    <span key={item.id}>{item.label}</span>
                  ))}
                </div>
              )}
              <em>{relation.output}</em>
            </div>
          ))}
        </div>
      </DiagnosisSection>

      <DiagnosisSection number="1-3" title="Сырой запрос клиента" note="Сначала фиксируется исходный запрос без интерпретации, затем определяется его тип и контекст возникновения.">
        <div className="project-theory-grid two">
          <TextField label="1. Что клиент просит сделать дословно?" placeholder="Зафиксируйте исходную формулировку клиента" value={diagnosis.rawRequest} onChange={value => updateDiagnosis({ rawRequest: value })} multiline />
          <SelectField label="2. Тип сырого запроса" options={requestTypeOptions} value={diagnosis.requestType} onChange={value => updateDiagnosis({ requestType: value })} />
          <TextField label="3. Что изменилось или стало неприемлемым?" placeholder="Не повторяйте запрос другими словами, опишите событие или изменение контекста" value={diagnosis.requestContext} onChange={value => updateDiagnosis({ requestContext: value })} multiline className="full" />
        </div>
      </DiagnosisSection>

      <DiagnosisSection number="4" title="Проверка против Теории проекта" note="Повторяемые строки фиксируют разрыв: ожидалось X, фактически Y, подтверждается фактом Z.">
        <div className="project-theory-repeater">
          {gaps.map((gap, index) => {
            const relation = getRelation(theoryRelations, gap.theoryBlock);

            return (
              <div className="project-theory-card" key={gap.id}>
                <div className="project-theory-card-head">
                  <div className="project-theory-card-title">Разрыв теории и реальности {index + 1}</div>
                  <span className="project-theory-status-badge">{gap.status}</span>
                </div>
                <div className="project-theory-grid two">
                  <SelectField label="Связанный блок Теории проекта" options={theoryRelations.map(item => item.title)} value={relation.title} onChange={title => updateGap(gap.id, { theoryBlock: theoryRelations.find(item => item.title === title)?.id || gap.theoryBlock })} />
                  <TextField label="Ожидаемое состояние из Теории проекта" value={gap.expectedState} readOnly />
                  <TextField label="Наблюдаемая реальность" placeholder="Что происходит фактически?" value={gap.observedReality} onChange={value => updateGap(gap.id, { observedReality: value })} multiline />
                  <TextField label="Разрыв" placeholder="Ожидалось X, фактически Y" value={gap.gap} onChange={value => updateGap(gap.id, { gap: value })} multiline />
                  <SelectField label="Подтверждающий факт" options={factNames} value={gap.confirmingFact} onChange={value => updateGap(gap.id, { confirmingFact: value })} />
                  <SelectField label="Статус разрыва" options={relationStatusOptions} value={gap.status} onChange={value => updateGap(gap.id, { status: value })} />
                </div>
              </div>
            );
          })}
          <button
            className="project-theory-add-card"
            type="button"
            onClick={() => setGaps(current => {
              const relation = theoryRelations[current.length % theoryRelations.length] || fallbackTheoryRelations[0];
              return [...current, createGapFromRelation(relation, current.length + 1)];
            })}
          >
            <Icon name="plus" size={16} />
            Добавить разрыв
          </button>
        </div>
      </DiagnosisSection>

      <DiagnosisSection number="5-6" title="Симптомы и факты" note="Симптомы описывают проявления проблемы, а факты дают проверяемые основания для диагноза.">
        <div className="project-diagnosis-split">
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">Наблюдаемые симптомы</div>
            {symptoms.map((symptom, index) => (
              <div className="project-theory-card" key={symptom.id}>
                <div className="project-theory-card-title">Симптом {index + 1}</div>
                <div className="project-theory-grid two">
                  <TextField label="Описание симптома" value={symptom.description} onChange={value => updateSymptom(symptom.id, { description: value })} multiline />
                  <TextField label="Где проявляется" value={symptom.location} onChange={value => updateSymptom(symptom.id, { location: value })} />
                  <TextField label="Кого затрагивает" value={symptom.affected} onChange={value => updateSymptom(symptom.id, { affected: value })} />
                  <TextField label="Частота / масштаб" value={symptom.frequency} onChange={value => updateSymptom(symptom.id, { frequency: value })} />
                  <SelectField label="Связанный разрыв" options={gapNames} value={symptom.relatedGap} onChange={value => updateSymptom(symptom.id, { relatedGap: value })} />
                  <SelectField label="Источник данных" options={dataSourceOptions} value={symptom.dataSource} onChange={value => updateSymptom(symptom.id, { dataSource: value })} />
                </div>
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setSymptoms(current => [...current, createSymptom(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить симптом
            </button>
          </div>

          <div className="project-theory-repeater">
            <div className="project-theory-card-title">Факты</div>
            {facts.map((fact, index) => (
              <div className="project-theory-card" key={fact.id}>
                <div className="project-theory-card-title">Факт {index + 1}</div>
                <div className="project-theory-grid two">
                  <TextField label="Показатель / наблюдение" value={fact.indicator} onChange={value => updateFact(fact.id, { indicator: value })} />
                  <TextField label="Значение" value={fact.value} onChange={value => updateFact(fact.id, { value })} />
                  <TextField label="Период" value={fact.period} onChange={value => updateFact(fact.id, { period: value })} />
                  <SelectField label="Источник данных" options={dataSourceOptions} value={fact.dataSource} onChange={value => updateFact(fact.id, { dataSource: value })} />
                  <SelectField label="Надежность источника" options={reliabilityOptions} value={fact.reliability} onChange={value => updateFact(fact.id, { reliability: value })} />
                  <SelectField label="Что подтверждает" options={[...symptomNames, ...gapNames, 'Диагностическое суждение']} value={fact.confirms} onChange={value => updateFact(fact.id, { confirms: value })} />
                </div>
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setFacts(current => [...current, createFact(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить факт
            </button>
          </div>
        </div>
      </DiagnosisSection>

      <DiagnosisSection number="7-11" title="Диагностическое суждение" note="Здесь формулируется главный вызов, тип препятствия, ограничивающий фактор и масштаб диагноза.">
        <div className="project-theory-grid two">
          <MultiSelectChecklist label="7. Область диагноза" options={diagnosisAreaOptions} values={diagnosis.areas} onToggle={value => toggleDiagnosisValue('areas', value)} />
          <TextField label="8. Ключевой вызов / диагностическое суждение" placeholder="[система / функция / команда] не достигает [нужного результата], потому что [главное препятствие]" value={diagnosis.keyChallenge} onChange={value => updateDiagnosis({ keyChallenge: value })} multiline className="full" />
          <SelectField label="9. Тип ключевого препятствия" options={obstacleTypeOptions} value={diagnosis.obstacleType} onChange={value => updateDiagnosis({ obstacleType: value })} />
          <TextField label="10. Ограничивающий фактор" value={diagnosis.limitingFactor} onChange={value => updateDiagnosis({ limitingFactor: value })} />
          <SelectField label="11. Масштаб диагноза" options={scaleOptions} value={diagnosis.scale} onChange={value => updateDiagnosis({ scale: value })} />
        </div>
      </DiagnosisSection>

      <DiagnosisSection number="12-14" title="Альтернативы, проверки и последствия" note="Диагноз должен выдерживать альтернативные объяснения, иметь план проверки и показывать ущерб без изменений.">
        <div className="project-diagnosis-split three">
          <div className="project-theory-repeater">
            <div className="project-theory-card-title">Альтернативные объяснения</div>
            {alternatives.map((alternative, index) => (
              <div className="project-theory-card" key={alternative.id}>
                <div className="project-theory-card-title">Альтернатива {index + 1}</div>
                <TextField label="Возможная причина" value={alternative.reason} onChange={value => updateAlternative(alternative.id, { reason: value })} multiline />
                <SelectField label="Что ее подтверждает" options={factNames} value={alternative.confirms} onChange={value => updateAlternative(alternative.id, { confirms: value })} />
                <SelectField label="Что ее опровергает" options={factNames} value={alternative.refutes} onChange={value => updateAlternative(alternative.id, { refutes: value })} />
                <SelectField label="Статус" options={alternativeStatusOptions} value={alternative.status} onChange={value => updateAlternative(alternative.id, { status: value })} />
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setAlternatives(current => [...current, createAlternative(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить альтернативу
            </button>
          </div>

          <div className="project-theory-repeater">
            <div className="project-theory-card-title">Проверка диагноза</div>
            {verifications.map((verification, index) => (
              <div className="project-theory-card" key={verification.id}>
                <div className="project-theory-card-title">Проверка {index + 1}</div>
                <TextField label="Что проверяем" value={verification.subject} onChange={value => updateVerification(verification.id, { subject: value })} multiline />
                <SelectField label="Метод проверки" options={verificationMethodOptions} value={verification.method} onChange={value => updateVerification(verification.id, { method: value })} />
                <TextField label="Факт, который подтвердит диагноз" value={verification.confirmFact} onChange={value => updateVerification(verification.id, { confirmFact: value })} multiline />
                <TextField label="Факт, который опровергнет диагноз" value={verification.refuteFact} onChange={value => updateVerification(verification.id, { refuteFact: value })} multiline />
                <TextField label="Срок проверки" value={verification.deadline} onChange={value => updateVerification(verification.id, { deadline: value })} />
                <TextField label="Ответственный" value={verification.owner} onChange={value => updateVerification(verification.id, { owner: value })} />
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setVerifications(current => [...current, createVerification(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить проверку
            </button>
          </div>

          <div className="project-theory-repeater">
            <div className="project-theory-card-title">Последствия без изменений</div>
            {consequences.map((consequence, index) => (
              <div className="project-theory-card" key={consequence.id}>
                <div className="project-theory-card-title">Последствие {index + 1}</div>
                <TextField label="Что ухудшится" value={consequence.deterioration} onChange={value => updateConsequence(consequence.id, { deterioration: value })} multiline />
                <TextField label="Кого затронет" value={consequence.affected} onChange={value => updateConsequence(consequence.id, { affected: value })} />
                <TextField label="Срок наступления" value={consequence.timing} onChange={value => updateConsequence(consequence.id, { timing: value })} />
                <TextField label="Возможный ущерб" value={consequence.damage} onChange={value => updateConsequence(consequence.id, { damage: value })} />
                <SelectField label="Источник оценки" options={dataSourceOptions} value={consequence.source} onChange={value => updateConsequence(consequence.id, { source: value })} />
              </div>
            ))}
            <button className="project-theory-add-card" type="button" onClick={() => setConsequences(current => [...current, createConsequence(current.length + 1)])}>
              <Icon name="plus" size={16} />
              Добавить последствие
            </button>
          </div>
        </div>
      </DiagnosisSection>

      <DiagnosisSection number="15-17" title="Вывод и итоговая формулировка" note="Диагноз готовит следующий экран: Стратегический выбор. Итог можно собрать автоматически и затем отредактировать.">
        <div className="project-theory-grid two">
          <TextField label="15. Вывод для стратегического выбора" placeholder="Какой стратегический выбор должен быть сделан, если диагноз верен?" value={diagnosis.strategicConclusion} onChange={value => updateDiagnosis({ strategicConclusion: value })} multiline />
          <TextField label="16. Что диагноз предварительно исключает" placeholder="Какие решения или объяснения уже не выглядят достаточными?" value={diagnosis.exclusions} onChange={value => updateDiagnosis({ exclusions: value })} multiline />
          <TextField label="17. Автособранная формулировка" value={generatedFinalStatement} readOnly multiline className="full" />
          <TextField label="17. Итоговая формулировка диагноза" placeholder="Скопируйте или переформулируйте автособранный диагноз" value={diagnosis.finalStatement} onChange={value => updateDiagnosis({ finalStatement: value })} multiline className="full" />
        </div>
      </DiagnosisSection>

      <section className="project-theory-validation">
        <div>
          <div className="project-panel-title">Методологическая проверка диагноза</div>
          <h3>{autoStatus}</h3>
          <p>Диагноз считается валидным, когда сырой запрос связан с Теорией проекта, симптомы отделены от проблемы, а ключевой вызов подтверждается фактами.</p>
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
          <span>18. Итоговый статус проверки</span>
          <input className="form-input" value={autoStatus} readOnly />
        </label>
      </section>
    </div>
  );
}
