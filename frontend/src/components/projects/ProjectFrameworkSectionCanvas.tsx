import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Icon from '../Icon';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot, writeProjectFrameworkSectionSnapshot, type ProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { getFallbackProjectStrategicChoiceSnapshot, readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { getFallbackProjectTargetStateSnapshot, readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot } from './projectTheorySnapshot';

type FieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'date';

type FieldDef = {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  placeholder?: string;
};

type RecordState = {
  id: number;
  values: Record<string, string>;
};

type SourceContext = ReturnType<typeof useProjectSources>;

type ScreenConfig = {
  id: string;
  title: string;
  lead: string;
  dependency: string;
  cardName: string;
  addLabel: string;
  primaryField: string;
  summaryFields: string[];
  requiredFields: string[];
  fields: FieldDef[];
  sourceCards: (sources: SourceContext) => Array<{ title: string; value: string; note: string }>;
  prefill?: (sources: SourceContext) => Record<string, string>;
};

const commonDataSources = ['CRM', 'финансы', 'HR', 'операционный отчет', 'аудит', 'опрос', 'акт приемки', 'системная аналитика'];
const statusOptions = ['черновик', 'в работе', 'подтверждено', 'требует пересмотра', 'закрыто'];
const ownerPlaceholder = 'Роль / пользователь';

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

function compactJoin(values: Array<string | undefined>) {
  return values.map(value => value?.trim()).filter(Boolean).join('; ');
}

function sectionFilledCount(snapshot: ProjectFrameworkSectionSnapshot | null) {
  return snapshot ? snapshot.items.filter(item => item.status !== 'не заполнено').length : 0;
}

// Live option labels of a section's cards (named or with a filled primary field).
function sectionOptions(snapshot: ProjectFrameworkSectionSnapshot | null) {
  return snapshot ? snapshot.items.map(item => item.label).filter(label => label.trim().length > 0) : [];
}

// Reserved key for the user-editable card name. Not part of any config.fields.
const NAME_KEY = '__cardName';

function readProjectSources(projectId: number) {
  const theory = readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId);
  const diagnosis = readProjectDiagnosisSnapshot(projectId) || getFallbackProjectDiagnosisSnapshot(projectId);
  const strategy = readProjectStrategicChoiceSnapshot(projectId) || getFallbackProjectStrategicChoiceSnapshot(projectId);
  const target = readProjectTargetStateSnapshot(projectId) || getFallbackProjectTargetStateSnapshot(projectId);

  const strategyMap = readProjectFrameworkSectionSnapshot(projectId, 'strategy-map');
  const hypothesesSection = readProjectFrameworkSectionSnapshot(projectId, 'hypotheses');
  const experiments = readProjectFrameworkSectionSnapshot(projectId, 'experiments');
  const decisions = readProjectFrameworkSectionSnapshot(projectId, 'decisions');
  const okr = readProjectFrameworkSectionSnapshot(projectId, 'okr-kpi');
  const initiatives = readProjectFrameworkSectionSnapshot(projectId, 'initiatives');
  const processes = readProjectFrameworkSectionSnapshot(projectId, 'business-processes');
  const tasksSection = readProjectFrameworkSectionSnapshot(projectId, 'tasks');

  const theoryText = compactJoin(theory.blocks.map(block => block.expectedState || block.fallbackExpectedState));
  const theoryResultOptions = theory.blocks.find(block => block.id === 'results')?.items.map(item => item.label).filter(Boolean) || [];
  const resultOptions = Array.from(new Set([
    ...theoryResultOptions,
    ...target.results.map(item => item.label).filter(Boolean),
    ...target.keyResults.map(item => item.label).filter(Boolean),
  ]));
  const stakeholderOptions = theory.blocks.find(block => block.id === 'stakeholder')?.items.map(item => item.label).filter(Boolean) || [];
  const constraintOptions = theory.blocks.find(block => block.id === 'constraints')?.items.map(item => item.label).filter(Boolean) || [];
  const qualityOptions = theory.blocks.find(block => block.id === 'quality')?.items.map(item => item.label).filter(Boolean) || [];
  const preserveOptions = theory.blocks.find(block => block.id === 'preserve')?.items.map(item => item.label).filter(Boolean) || [];

  return {
    theory,
    diagnosis,
    strategy,
    target,
    strategyMap,
    hypothesesSection,
    experiments,
    decisions,
    okr,
    initiatives,
    processes,
    tasksSection,
    theoryText,
    resultOptions,
    stakeholderOptions,
    constraintOptions,
    qualityOptions,
    preserveOptions,
  };
}

function useProjectSources(projectId: number) {
  return useMemo(() => readProjectSources(projectId), [projectId]);
}

function TextField({ field, value, onChange }: { field: FieldDef; value: string; onChange: (value: string) => void }) {
  if (field.type === 'multiselect') {
    const selected = value.split('; ').map(item => item.trim()).filter(Boolean);
    const options = field.options || [];
    return (
      <div className="project-theory-field full">
        <span>{field.label}</span>
        <div className="project-theory-check-list dense">
          {options.length === 0 && <em>Сначала заполните связанный раздел</em>}
          {options.map(option => {
            const checked = selected.includes(option);
            return (
              <label className="project-theory-check-option" key={option}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onChange((checked ? selected.filter(item => item !== option) : [...selected, option]).join('; '))}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <label className="project-theory-field">
      <span>{field.label}</span>
      {field.type === 'select' ? (
        <select className="form-select" value={value} onChange={event => onChange(event.target.value)}>
          <option value="">Выберите значение</option>
          {(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : field.type === 'textarea' ? (
        <textarea className="form-textarea" value={value} placeholder={field.placeholder} onChange={event => onChange(event.target.value)} />
      ) : (
        <input className="form-input" type={field.type === 'date' ? 'date' : 'text'} value={value} placeholder={field.placeholder} onChange={event => onChange(event.target.value)} />
      )}
    </label>
  );
}

function Section({ number, title, note, children }: { number: string; title: string; note: string; children: ReactNode }) {
  return (
    <section className="project-theory-section">
      <div className="project-theory-section-head">
        <div>
          <span>{number}</span>
          <h3>{title}</h3>
        </div>
        <p>{note}</p>
      </div>
      {children}
    </section>
  );
}

function createRecord(config: ScreenConfig, sources: SourceContext, id: number): RecordState {
  const prefill = config.prefill?.(sources) || {};
  return {
    id,
    values: {
      [NAME_KEY]: '',
      ...Object.fromEntries(config.fields.map(field => [field.key, prefill[field.key] || ''])),
    },
  };
}

function getRecordSummary(record: RecordState, config: ScreenConfig) {
  return compactJoin(config.summaryFields.map(field => record.values[field]));
}

function getRecordStatus(record: RecordState, config: ScreenConfig) {
  const filled = config.requiredFields.filter(field => hasText(record.values[field])).length;
  if (filled === 0) return 'не заполнено';
  if (filled === config.requiredFields.length) return 'валидно';
  return 'заполнено частично';
}

function getFieldOptions(base: string[], fallback: string[]) {
  return base.length ? base : fallback;
}

function createConfigs(sources: SourceContext): Record<string, ScreenConfig> {
  const resultOptions = getFieldOptions(sources.resultOptions, ['критерий результата', 'KR', 'KPI', 'качество']);
  const stakeholderOptions = getFieldOptions(sources.stakeholderOptions, ['клиент', 'пользователь результата', 'выгодоприобретатель']);
  const constraintOptions = getFieldOptions(sources.constraintOptions, ['срок', 'бюджет', 'ресурс', 'регуляторное ограничение']);
  const qualityOptions = getFieldOptions(sources.qualityOptions, ['дефекты', 'SLA', 'приемка', 'качество сервиса']);
  const preserveOptions = getFieldOptions(sources.preserveOptions, ['миссия', 'доверие клиента', 'критический процесс', 'качество']);

  const strategyMapOptions = sectionOptions(sources.strategyMap);
  const hypothesisOptions = Array.from(new Set([
    ...sectionOptions(sources.hypothesesSection),
    ...sources.strategy.hypotheses.map(item => item.label).filter(Boolean),
  ]));
  const experimentOptions = sectionOptions(sources.experiments);
  const initiativeOptions = sectionOptions(sources.initiatives);
  const taskOptions = sectionOptions(sources.tasksSection);
  const strategyChoiceOptions = Array.from(new Set([
    sources.strategy.acceptedChoice,
    sources.strategy.howToWin,
    sources.strategy.guidingPolicy,
    sources.strategy.whereToPlay,
    ...sources.strategy.capabilities.map(item => item.label),
    ...sources.strategy.actions.map(item => item.label),
  ].filter(Boolean)));

  return {
    'strategy-map': {
      id: 'strategy-map',
      title: 'Стратегическая карта',
      lead: 'Причинно-следственная карта связывает обучение и развитие, процессы, клиентскую ценность и итоговый результат.',
      dependency: 'Теория проекта → Диагноз → Стратегический выбор → Целевое состояние → Стратегическая карта',
      cardName: 'Стратегическая цель',
      addLabel: 'Добавить цель',
      primaryField: 'goal',
      summaryFields: ['perspective', 'cause', 'effect', 'metric', 'target', 'initiative'],
      requiredFields: ['perspective', 'goal', 'cause', 'effect', 'metric', 'target'],
      sourceCards: s => [
        { title: 'Целевое состояние', value: s.target.finalStatement || s.target.statement || 'Сначала заполните Целевое состояние', note: 'Будущая система, которую карта раскладывает на причинно-следственные цели.' },
        { title: 'Стратегический выбор', value: s.strategy.guidingPolicy || s.strategy.acceptedChoice || 'Сначала заполните Стратегический выбор', note: 'Guiding policy задает логику карты.' },
        { title: 'Диагноз', value: s.diagnosis.keyChallenge || s.diagnosis.finalStatement || 'Сначала заполните Диагноз', note: 'Карта должна отвечать на главное препятствие.' },
      ],
      prefill: s => ({
        goal: s.target.objective || s.target.statement,
        effect: s.target.keyResults[0]?.label || s.target.results[0]?.label || '',
        cause: s.strategy.howToWin || s.strategy.capabilities[0]?.label || '',
      }),
      fields: [
        { key: 'perspective', label: 'Перспектива', type: 'select', options: ['Финансы', 'Клиенты', 'Внутренние процессы', 'Обучение и развитие'] },
        { key: 'goal', label: 'Стратегическая цель', type: 'textarea', placeholder: 'Что должно измениться в этой перспективе' },
        { key: 'cause', label: 'Причина / фактор достижения', type: 'textarea' },
        { key: 'effect', label: 'На какой результат влияет', type: 'select', options: resultOptions },
        { key: 'metric', label: 'Показатель', placeholder: 'Метрика результата или фактора' },
        { key: 'target', label: 'Целевое значение' },
        { key: 'initiative', label: 'Связанные инициативы', type: 'multiselect', options: initiativeOptions },
        { key: 'hypothesis', label: 'Проверяемая причинно-следственная гипотеза', type: 'textarea' },
      ],
    },
    hypotheses: {
      id: 'hypotheses',
      title: 'Гипотезы',
      lead: 'Реестр проверяемых предположений, на которых держатся стратегия, карта, целевое состояние и ограничения.',
      dependency: 'Диагноз / Стратегический выбор / Целевое состояние / Стратегическая карта → Гипотезы',
      cardName: 'Гипотеза',
      addLabel: 'Добавить гипотезу',
      primaryField: 'statement',
      summaryFields: ['source', 'type', 'expectedEffect', 'confirmFact', 'refuteFact', 'method'],
      requiredFields: ['source', 'type', 'statement', 'expectedEffect', 'confirmFact', 'refuteFact', 'method', 'owner'],
      sourceCards: s => [
        { title: 'Стратегический выбор', value: s.strategy.acceptedChoice || s.strategy.guidingPolicy || 'Сначала заполните Стратегический выбор', note: 'Из выбора берутся ключевые предположения.' },
        { title: 'Целевое состояние', value: s.target.finalStatement || 'Сначала заполните Целевое состояние', note: 'Будущее состояние задает ожидаемый эффект.' },
        { title: 'Диагноз', value: s.diagnosis.keyChallenge || s.diagnosis.finalStatement || 'Сначала заполните Диагноз', note: 'Гипотеза должна быть связана с препятствием.' },
      ],
      prefill: s => ({ source: 'стратегический выбор', statement: s.strategy.hypotheses[0]?.summary || '', expectedEffect: s.target.keyResults[0]?.label || '' }),
      fields: [
        { key: 'source', label: 'Источник гипотезы', type: 'select', options: ['диагноз', 'стратегический выбор', 'целевое состояние', 'стратегическая карта', 'ограничение', 'качество', 'компетенция'] },
        { key: 'type', label: 'Тип гипотезы', type: 'select', options: ['причинно-следственная', 'клиентская', 'операционная', 'финансовая', 'компетентностная', 'ограничение / риск'] },
        { key: 'statement', label: 'Формулировка если → то → потому что', type: 'textarea' },
        { key: 'strategicChoice', label: 'Связанный стратегический выбор', type: 'select', options: strategyChoiceOptions },
        { key: 'mapNode', label: 'Связанный узел стратегической карты', type: 'select', options: strategyMapOptions },
        { key: 'expectedEffect', label: 'Ожидаемый эффект' },
        { key: 'confirmFact', label: 'Факт подтверждения', type: 'textarea' },
        { key: 'refuteFact', label: 'Факт опровержения', type: 'textarea' },
        { key: 'dataSource', label: 'Источник данных', type: 'select', options: commonDataSources },
        { key: 'method', label: 'Метод проверки', type: 'select', options: ['анализ данных', 'пилот', 'интервью', 'опрос', 'аудит процесса', 'наблюдение', 'сравнение периодов', 'проверка KPI'] },
        { key: 'dueDate', label: 'Срок проверки', type: 'date' },
        { key: 'owner', label: 'Владелец гипотезы', placeholder: ownerPlaceholder },
        { key: 'status', label: 'Статус', type: 'select', options: statusOptions },
      ],
    },
    experiments: {
      id: 'experiments',
      title: 'Проверки',
      lead: 'Проверка переводит гипотезу в способ получения факта: что измеряем, как, где пороги подтверждения и опровержения.',
      dependency: 'Гипотезы → Проверки → Решения / Факты и обучение',
      cardName: 'Проверка',
      addLabel: 'Добавить проверку',
      primaryField: 'subject',
      summaryFields: ['hypothesis', 'method', 'metric', 'confirmThreshold', 'refuteThreshold', 'result'],
      requiredFields: ['hypothesis', 'subject', 'method', 'metric', 'confirmThreshold', 'refuteThreshold', 'dataSource', 'period', 'owner'],
      sourceCards: s => [
        { title: 'Гипотезы из стратегии', value: s.strategy.hypotheses.map(item => item.label).join(', ') || 'Сначала зафиксируйте гипотезы', note: 'Проверка должна отвечать на конкретную гипотезу.' },
        { title: 'Метрики результата', value: compactJoin([s.target.keyResults[0]?.label, s.target.results[0]?.label]) || 'Сначала заполните целевые результаты', note: 'Порог проверки лучше связывать с KR/KPI/качеством.' },
      ],
      fields: [
        { key: 'hypothesis', label: 'Проверяемая гипотеза', type: 'select', options: hypothesisOptions },
        { key: 'subject', label: 'Что проверяем', type: 'textarea' },
        { key: 'method', label: 'Метод проверки', type: 'select', options: ['анализ данных', 'пилот', 'интервью', 'опрос', 'аудит процесса', 'наблюдение', 'сравнение периодов', 'сравнение сегментов', 'проверка KPI', 'приемка результата'] },
        { key: 'metric', label: 'Проверяемая метрика', type: 'select', options: [...resultOptions, ...qualityOptions] },
        { key: 'baseline', label: 'Базовое значение' },
        { key: 'confirmThreshold', label: 'Порог подтверждения' },
        { key: 'refuteThreshold', label: 'Порог опровержения' },
        { key: 'dataSource', label: 'Источник данных', type: 'select', options: commonDataSources },
        { key: 'period', label: 'Период проверки' },
        { key: 'owner', label: 'Ответственный за проверку', placeholder: ownerPlaceholder },
        { key: 'resource', label: 'Стоимость / ресурс проверки' },
        { key: 'constraints', label: 'Ограничения проверки', type: 'select', options: constraintOptions },
        { key: 'result', label: 'Результат проверки', type: 'select', options: ['подтверждена', 'опровергнута', 'недостаточно данных'] },
        { key: 'fact', label: 'Полученный факт', type: 'textarea' },
        { key: 'nextAction', label: 'Следующее действие', type: 'select', options: ['принять решение', 'продлить проверку', 'изменить гипотезу', 'остановить инициативу', 'пересмотреть стратегический выбор'] },
      ],
    },
    decisions: {
      id: 'decisions',
      title: 'Решения',
      lead: 'Управленческое решение фиксирует выбор на основании фактов, проверки или риска и сразу переводится в действие.',
      dependency: 'Проверки / Факты / Гипотезы / Диагноз / Стратегический выбор → Решения',
      cardName: 'Решение',
      addLabel: 'Добавить решение',
      primaryField: 'statement',
      summaryFields: ['source', 'type', 'confirmFact', 'excluded', 'actions', 'status'],
      requiredFields: ['source', 'type', 'statement', 'confirmFact', 'guidingPolicy', 'actions', 'owner', 'approver', 'reviewDate'],
      sourceCards: s => [
        { title: 'Guiding policy', value: s.strategy.guidingPolicy || 'Сначала заполните Стратегический выбор', note: 'Решение должно быть совместимо с направляющей политикой.' },
        { title: 'Проверки и гипотезы', value: compactJoin([...sectionOptions(s.experiments), ...sectionOptions(s.hypothesesSection)]) || 'Сначала заполните Гипотезы и Проверки', note: 'Решение опирается на проверенный факт или гипотезу.' },
        { title: 'Факты диагностики', value: s.diagnosis.facts.map(item => item.label).join(', ') || s.diagnosis.finalStatement || 'Факты пока не указаны', note: 'Решение не должно приниматься без основания.' },
      ],
      fields: [
        { key: 'source', label: 'Источник решения', type: 'select', options: ['гипотеза', 'проверка', 'факт', 'диагноз', 'стратегический выбор', 'ограничение', 'риск'] },
        { key: 'type', label: 'Тип решения', type: 'select', options: ['подтвердить выбор', 'изменить выбор', 'запустить инициативу', 'остановить инициативу', 'изменить KPI', 'изменить процесс', 'изменить ограничение', 'пересмотреть диагноз', 'ничего не делать'] },
        { key: 'statement', label: 'Формулировка решения', type: 'textarea' },
        { key: 'confirmFact', label: 'Почему принято: подтверждающий факт', type: 'textarea' },
        { key: 'checkResult', label: 'Почему принято: результат проверки', type: 'select', options: experimentOptions },
        { key: 'relatedHypothesis', label: 'Почему принято: связанная гипотеза', type: 'select', options: hypothesisOptions },
        { key: 'relatedCriterion', label: 'Почему принято: связанный критерий результата', type: 'select', options: resultOptions },
        { key: 'alternatives', label: 'Альтернативы', type: 'textarea' },
        { key: 'excluded', label: 'Что исключаем / trade-off', type: 'textarea' },
        { key: 'guidingPolicy', label: 'Связь с guiding policy', type: 'textarea' },
        { key: 'constraints', label: 'Ограничения решения', type: 'select', options: constraintOptions },
        { key: 'preserve', label: 'Что нельзя разрушить', type: 'select', options: preserveOptions },
        { key: 'actions', label: 'Действия для реализации', type: 'textarea' },
        { key: 'owner', label: 'Ответственный за решение', placeholder: ownerPlaceholder },
        { key: 'approver', label: 'Кто утверждает', placeholder: ownerPlaceholder },
        { key: 'reviewDate', label: 'Срок пересмотра решения' },
        { key: 'status', label: 'Статус', type: 'select', options: ['черновик', 'принято', 'в реализации', 'требует пересмотра', 'отменено', 'закрыто'] },
      ],
    },
    initiatives: {
      id: 'initiatives',
      title: 'Инициативы',
      lead: 'Инициатива собирает комплекс действий, который реализует выбор, карту, цели, capabilities и management systems.',
      dependency: 'Стратегическая карта / Решения / OKR / KPI / Ограничения → Инициативы',
      cardName: 'Инициатива',
      addLabel: 'Добавить инициативу',
      primaryField: 'statement',
      summaryFields: ['source', 'supportedResult', 'supportedChoice', 'effectMetric', 'resources', 'status'],
      requiredFields: ['source', 'supportedResult', 'supportedChoice', 'statement', 'effectMetric', 'targetValue', 'controlSource', 'owner', 'startDate', 'finishDate'],
      sourceCards: s => [
        { title: 'Стратегический выбор', value: s.strategy.acceptedChoice || s.strategy.guidingPolicy || 'Сначала заполните Стратегический выбор', note: 'Инициатива должна поддерживать where/how/capability/system.' },
        { title: 'OKR и решения', value: compactJoin([...sectionOptions(s.okr), ...sectionOptions(s.decisions)]) || 'Сначала заполните OKR и Решения', note: 'Инициатива реализует цели и управленческие решения.' },
        { title: 'Целевые результаты', value: s.target.results.map(item => item.label).join(', ') || 'Сначала заполните Целевое состояние', note: 'Эффект инициативы должен быть измерим.' },
      ],
      prefill: s => ({ source: 'стратегический выбор', supportedChoice: s.strategy.howToWin || s.strategy.guidingPolicy, supportedResult: s.target.results[0]?.label || '' }),
      fields: [
        { key: 'source', label: 'Источник инициативы', type: 'select', options: ['стратегическая карта', 'решение', 'гипотеза', 'OKR', 'KPI', 'ограничение', 'качество'] },
        { key: 'strategicGoal', label: 'Связанная стратегическая цель', type: 'select', options: strategyMapOptions },
        { key: 'supportedResult', label: 'Какой результат поддерживает', type: 'select', options: resultOptions },
        { key: 'supportedChoice', label: 'Какой выбор поддерживает', type: 'textarea' },
        { key: 'statement', label: 'Формулировка инициативы', type: 'textarea' },
        { key: 'effectMetric', label: 'Метрика ожидаемого эффекта' },
        { key: 'baseline', label: 'Базовое значение' },
        { key: 'targetValue', label: 'Целевое значение' },
        { key: 'deadline', label: 'Срок эффекта' },
        { key: 'controlSource', label: 'Источник контроля', type: 'select', options: commonDataSources },
        { key: 'tasks', label: 'Состав работ / задачи', type: 'multiselect', options: taskOptions },
        { key: 'resources', label: 'Ресурсы', type: 'textarea', placeholder: 'Бюджет, люди, время, системы, подрядчики / партнеры' },
        { key: 'constraints', label: 'Ограничения', type: 'select', options: constraintOptions },
        { key: 'risks', label: 'Риски', type: 'textarea' },
        { key: 'preserve', label: 'Что нельзя разрушить', type: 'select', options: preserveOptions },
        { key: 'owner', label: 'Владелец инициативы', placeholder: ownerPlaceholder },
        { key: 'startDate', label: 'Старт', type: 'date' },
        { key: 'checkpoint', label: 'Контрольная точка', type: 'date' },
        { key: 'finishDate', label: 'Завершение', type: 'date' },
        { key: 'status', label: 'Статус', type: 'select', options: ['идея', 'утверждена', 'в работе', 'на паузе', 'завершена', 'отменена'] },
      ],
    },
    'business-processes': {
      id: 'business-processes',
      title: 'Бизнес-процессы',
      lead: 'Бизнес-процессы описывают операционную систему, которая должна стабильно создавать клиентскую ценность и результат.',
      dependency: 'Целевое состояние / Инициативы / Качество / Ограничения → Бизнес-процессы',
      cardName: 'Бизнес-процесс',
      addLabel: 'Добавить процесс',
      primaryField: 'name',
      summaryFields: ['type', 'classification', 'goal', 'client', 'metrics', 'targetValues'],
      requiredFields: ['type', 'classification', 'name', 'goal', 'client', 'input', 'output', 'owner', 'metrics', 'targetValues', 'controlSource'],
      sourceCards: s => [
        { title: 'Операционная модель', value: s.target.operatingModels.map(item => item.label).join(', ') || 'Сначала заполните Целевое состояние', note: 'Процесс должен производить целевую ценность.' },
        { title: 'Качество', value: qualityOptions.join(', '), note: 'Метрики процесса должны учитывать время, качество и издержки.' },
      ],
      fields: [
        { key: 'type', label: 'Тип процесса', type: 'select', options: ['инновационный процесс', 'операционный процесс', 'послепродажное обслуживание'] },
        { key: 'classification', label: 'Классификация Strategy Maps', type: 'select', options: ['operations management', 'customer management', 'innovation', 'regulatory and social'] },
        { key: 'name', label: 'Название процесса' },
        { key: 'goal', label: 'Цель процесса', type: 'select', options: resultOptions },
        { key: 'client', label: 'Клиент процесса', type: 'select', options: stakeholderOptions },
        { key: 'input', label: 'Вход процесса', type: 'textarea' },
        { key: 'output', label: 'Выход процесса', type: 'textarea' },
        { key: 'startBoundary', label: 'Граница процесса: начало' },
        { key: 'endBoundary', label: 'Граница процесса: конец' },
        { key: 'owner', label: 'Владелец процесса', placeholder: ownerPlaceholder },
        { key: 'participants', label: 'Участники', type: 'textarea' },
        { key: 'metrics', label: 'Метрики процесса', type: 'textarea', placeholder: 'Время / качество / издержки' },
        { key: 'targetValues', label: 'Целевые значения' },
        { key: 'controlSource', label: 'Источник контроля', type: 'select', options: ['CRM', 'ERP', 'операционный отчет', 'аудит', 'сервисная система'] },
        { key: 'initiatives', label: 'Связанные инициативы', type: 'multiselect', options: initiativeOptions },
        { key: 'tasks', label: 'Связанные задачи', type: 'multiselect', options: taskOptions },
      ],
    },
    tasks: {
      id: 'tasks',
      title: 'Задачи',
      lead: 'Задача превращает инициативы, процессы, проверки и решения в accountable assignment: результат, срок, ответственность и подтверждение.',
      dependency: 'Инициативы / Бизнес-процессы / Проверки / Решения / OKR → Задачи',
      cardName: 'Задача',
      addLabel: 'Добавить задачу',
      primaryField: 'statement',
      summaryFields: ['source', 'expectedResult', 'resultCriterion', 'owner', 'assignee', 'status'],
      requiredFields: ['source', 'statement', 'expectedResult', 'resultCriterion', 'owner', 'assignee', 'deadline', 'doneCriteria', 'confirmationSource'],
      sourceCards: s => [
        { title: 'Coherent actions', value: s.strategy.actions.map(item => item.label).join(', ') || 'Сначала заполните действия в Стратегическом выборе', note: 'Задачи должны быть связаны с выбранными действиями.' },
        { title: 'Инициативы и процессы', value: compactJoin([...sectionOptions(s.initiatives), ...sectionOptions(s.processes)]) || 'Сначала заполните Инициативы и Бизнес-процессы', note: 'Задача исполняет инициативу или процесс.' },
        { title: 'KR / критерии', value: resultOptions.join(', ') || s.target.keyResults.map(item => item.label).join(', ') || 'Критерии результата пока не указаны', note: 'У задачи должен быть проверяемый результат.' },
      ],
      fields: [
        { key: 'source', label: 'Источник задачи', type: 'select', options: ['инициатива', 'coherent action', 'решение', 'бизнес-процесс', 'OKR', 'проверка'] },
        { key: 'statement', label: 'Формулировка задачи', type: 'textarea' },
        { key: 'expectedResult', label: 'Ожидаемый результат задачи', type: 'textarea' },
        { key: 'resultCriterion', label: 'Связанный критерий результата / KR / KPI', type: 'select', options: resultOptions },
        { key: 'owner', label: 'Владелец задачи', placeholder: ownerPlaceholder },
        { key: 'assignee', label: 'Исполнитель', placeholder: ownerPlaceholder },
        { key: 'deadline', label: 'Срок', type: 'date' },
        { key: 'priority', label: 'Приоритет', type: 'select', options: ['критический', 'высокий', 'средний', 'низкий'] },
        { key: 'dependencies', label: 'Зависимости', type: 'textarea' },
        { key: 'resources', label: 'Ресурсы', type: 'textarea', placeholder: 'Время, бюджет, доступ, данные, люди' },
        { key: 'doneCriteria', label: 'Критерий готовности', type: 'textarea' },
        { key: 'confirmationSource', label: 'Источник подтверждения', type: 'select', options: ['артефакт', 'отчет', 'акт', 'система', 'факт'] },
        { key: 'feedback', label: 'Feedback from results', type: 'textarea' },
        { key: 'status', label: 'Статус', type: 'select', options: ['backlog', 'в работе', 'заблокирована', 'выполнена', 'отменена', 'требует пересмотра'] },
      ],
    },
    'facts-learning': {
      id: 'facts-learning',
      title: 'Факты и обучение',
      lead: 'Факты и обучение замыкают петлю: проверяемые данные возвращаются в гипотезы, решения, KPI, процессы, задачи и ранние стратегические экраны.',
      dependency: 'Проверки / OKR / Задачи / Бизнес-процессы / Решения → Факты и обучение → весь проект',
      cardName: 'Факт и обучение',
      addLabel: 'Добавить факт',
      primaryField: 'fact',
      summaryFields: ['source', 'value', 'reliability', 'confirms', 'refutes', 'learning', 'change'],
      requiredFields: ['source', 'fact', 'value', 'period', 'dataSource', 'reliability', 'conclusion', 'learning', 'change', 'owner', 'status'],
      sourceCards: s => {
        const counts = compactJoin([
          `проверки: ${sectionFilledCount(s.experiments)}`,
          `OKR: ${sectionFilledCount(s.okr)}`,
          `задачи: ${sectionFilledCount(s.tasksSection)}`,
          `процессы: ${sectionFilledCount(s.processes)}`,
          `решения: ${sectionFilledCount(s.decisions)}`,
        ]);
        const hasEvidence = [s.experiments, s.okr, s.tasksSection, s.processes, s.decisions].some(snapshot => sectionFilledCount(snapshot) > 0);
        return [
          { title: 'Источники фактов', value: hasEvidence ? counts : 'Сначала заполните Проверки, OKR, Задачи, Бизнес-процессы и Решения', note: 'Факт должен иметь источник и надежность.' },
          { title: 'Обратная связь', value: 'Обучение может изменить диагноз, выбор, гипотезу, проверку, KPI, инициативу, процесс или задачу.', note: 'Это финальная петля обновления модели проекта.' },
        ];
      },
      fields: [
        { key: 'source', label: 'Источник факта', type: 'select', options: ['проверка', 'KPI', 'KR', 'процесс', 'задача', 'клиент', 'качество', 'финансы', 'HR', 'аудит'] },
        { key: 'fact', label: 'Описание факта', type: 'textarea' },
        { key: 'value', label: 'Значение' },
        { key: 'period', label: 'Период' },
        { key: 'dataSource', label: 'Источник данных', type: 'select', options: commonDataSources },
        { key: 'reliability', label: 'Надежность факта', type: 'select', options: ['высокая', 'средняя', 'низкая'] },
        { key: 'confirms', label: 'Что подтверждает', type: 'textarea' },
        { key: 'refutes', label: 'Что опровергает', type: 'textarea' },
        { key: 'conclusion', label: 'Вывод', type: 'textarea' },
        { key: 'learning', label: 'Что мы узнали', type: 'textarea' },
        { key: 'wrong', label: 'Что оказалось неверным', type: 'textarea' },
        { key: 'keep', label: 'Что сохраняем', type: 'textarea' },
        { key: 'change', label: 'Что меняем', type: 'select', options: ['диагноз', 'выбор', 'гипотезу', 'проверку', 'KPI', 'инициативу', 'процесс', 'задачу'] },
        { key: 'stop', label: 'Что прекращаем', type: 'textarea' },
        { key: 'newHypothesis', label: 'Новое предположение', type: 'textarea' },
        { key: 'newDecision', label: 'Новое решение', type: 'textarea' },
        { key: 'owner', label: 'Ответственный за внедрение обучения', placeholder: ownerPlaceholder },
        { key: 'status', label: 'Статус', type: 'select', options: ['зафиксировано', 'принято в работу', 'применено', 'закрыто'] },
      ],
    },
  };
}

function buildValidationChecks(config: ScreenConfig, sources: SourceContext, records: RecordState[]): Array<[string, string]> {
  const sourceReady = config.sourceCards(sources).some(card => !card.value.startsWith('Сначала заполните'));
  return [
    ['есть связь с предыдущими разделами', sourceReady ? 'yes' : ''],
    ['есть минимум одна карточка', records.length ? 'yes' : ''],
    ['заполнено ключевое поле', records.some(record => hasText(record.values[config.primaryField])) ? 'yes' : ''],
    ['закрыты обязательные поля', records.some(record => config.requiredFields.every(field => hasText(record.values[field]))) ? 'yes' : ''],
    ['есть владелец или ответственный', records.some(record => hasText(record.values.owner) || hasText(record.values.assignee)) ? 'yes' : ''],
    ['есть измеримый результат / источник контроля', records.some(record => hasText(record.values.metric) || hasText(record.values.target) || hasText(record.values.controlSource) || hasText(record.values.dataSource)) ? 'yes' : ''],
  ];
}

function buildSectionSnapshot(projectId: number, config: ScreenConfig, sources: SourceContext, records: RecordState[]): ProjectFrameworkSectionSnapshot {
  const checks = buildValidationChecks(config, sources, records);
  return {
    projectId,
    sectionId: config.id,
    title: config.title,
    updatedAt: new Date().toISOString(),
    items: records.map(record => ({
      id: String(record.id),
      label: record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || '',
      summary: getRecordSummary(record, config),
      status: getRecordStatus(record, config),
    })),
    completedChecks: checks.filter(([, value]) => hasText(value)).length,
    totalChecks: checks.length,
  };
}

export const GENERIC_SECTION_IDS = [
  'strategy-map',
  'hypotheses',
  'experiments',
  'decisions',
  'initiatives',
  'business-processes',
  'tasks',
  'facts-learning',
];

// Seeds snapshots for sections the user has not opened yet, so the «Весь проект» screen
// reflects data that flows down from earlier screens (prefill) without visiting each one.
// Never overwrites an existing snapshot (user data is preserved).
export function seedFrameworkSectionSnapshots(projectId: number) {
  const sources = readProjectSources(projectId);
  const configs = createConfigs(sources);
  GENERIC_SECTION_IDS.forEach(screenId => {
    if (readProjectFrameworkSectionSnapshot(projectId, screenId)) return;
    const config = configs[screenId];
    if (!config) return;
    writeProjectFrameworkSectionSnapshot(projectId, screenId, buildSectionSnapshot(projectId, config, sources, [createRecord(config, sources, 1)]));
  });
}

interface ProjectFrameworkSectionCanvasProps {
  projectId: number;
  screenId: string;
}

export default function ProjectFrameworkSectionCanvas({ projectId, screenId }: ProjectFrameworkSectionCanvasProps) {
  const sources = useProjectSources(projectId);
  const config = createConfigs(sources)[screenId];
  const [records, setRecords] = useState<RecordState[]>(() => config ? [createRecord(config, sources, 1)] : []);

  const validationChecks = useMemo<Array<[string, string]>>(() => config ? buildValidationChecks(config, sources, records) : [], [config, records, sources]);

  const completedChecks = validationChecks.filter(([, value]) => hasText(value)).length;

  useEffect(() => {
    if (!config) return;
    writeProjectFrameworkSectionSnapshot(projectId, config.id, buildSectionSnapshot(projectId, config, sources, records));
  }, [config, projectId, records, sources]);

  if (!config) {
    return (
      <div className="project-theory">
        <section className="project-theory-hero">
          <div>
            <span>Раздел проекта</span>
            <h2>Раздел не найден</h2>
            <p>Для этой карточки пока нет конфигурации экрана.</p>
          </div>
        </section>
      </div>
    );
  }

  function updateRecord(id: number, key: string, value: string) {
    setRecords(current => current.map(record => record.id === id ? { ...record, values: { ...record.values, [key]: value } } : record));
  }

  return (
    <div className="project-theory project-framework-section">
      <section className="project-theory-hero">
        <div>
          <span>Проекты / {config.title}</span>
          <h2>{config.title}</h2>
          <p>{config.lead}</p>
        </div>
        <label className="project-theory-field compact">
          <span>Методологическая проверка</span>
          <input className="form-input" value={`${completedChecks} из ${validationChecks.length}`} readOnly />
        </label>
      </section>

      <Section number="0" title="Связь с предыдущими разделами" note={config.dependency}>
        <div className="project-strategy-sources">
          {config.sourceCards(sources).map(card => (
            <div className="project-strategy-source-card" key={card.title}>
              <span>{card.title}</span>
              <strong>{card.value}</strong>
              <em>{card.note}</em>
            </div>
          ))}
        </div>
      </Section>

      <Section number="1" title={config.cardName} note="Повторяемая карточка: добавляйте столько элементов, сколько нужно для проекта.">
        <div className="project-theory-repeater">
          {records.map((record, index) => (
            <div className="project-theory-card" key={record.id}>
              <div className="project-theory-card-title">
                <input
                  className="form-input project-card-name-input"
                  placeholder={`${config.cardName} ${index + 1}`}
                  value={record.values[NAME_KEY] || ''}
                  onChange={event => updateRecord(record.id, NAME_KEY, event.target.value)}
                />
                <span>{getRecordStatus(record, config)}</span>
              </div>
              <div className="project-theory-grid two">
                {config.fields.map(field => (
                  <TextField
                    field={field}
                    key={field.key}
                    value={record.values[field.key] || ''}
                    onChange={value => updateRecord(record.id, field.key, value)}
                  />
                ))}
              </div>
            </div>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setRecords(current => [...current, createRecord(config, sources, current.length + 1)])}>
            <Icon name="plus" size={16} />
            {config.addLabel}
          </button>
        </div>
      </Section>

      <Section number="2" title="Методологическая проверка" note="Раздел считается готовым, когда он связан с предыдущими экранами, имеет владельца, измеримость и заполненные обязательные поля.">
        <div className="project-theory-validation-list">
          {validationChecks.map(([label, value]) => (
            <label className="project-theory-validation-item" key={label}>
              <input type="checkbox" checked={hasText(String(value))} readOnly />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
