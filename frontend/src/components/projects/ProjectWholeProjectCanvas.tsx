import { useMemo, type ReactNode } from 'react';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { getFallbackProjectStrategicChoiceSnapshot, readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { getFallbackProjectTargetStateSnapshot, readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot } from './projectTheorySnapshot';

const projectFlow = [
  ['Теория проекта', 'задает исходную модель: миссия, клиент, результат, компетенции, ограничения, качество и ядро'],
  ['Диагноз', 'проверяет модель об факты и фиксирует главное препятствие'],
  ['Стратегический выбор', 'выбирает where to play, how to win, capabilities, systems и trade-offs'],
  ['Целевое состояние', 'описывает будущую систему после выбранной стратегии'],
  ['Стратегическая карта', 'связывает цели причинно-следственно'],
  ['Гипотезы', 'фиксируют предположения, на которых держится стратегия'],
  ['Проверки', 'превращают гипотезы в способы получения фактов'],
  ['Решения', 'фиксируют управленческий выбор на основании фактов'],
  ['OKR / KPI', 'переводят стратегию и решения в измеримые цели и показатели'],
  ['Инициативы', 'создают комплексы действий для достижения целей'],
  ['Бизнес-процессы', 'описывают операционную систему, которая производит результат'],
  ['Задачи', 'превращают инициативы и процессы в accountable assignments'],
  ['Факты и обучение', 'возвращают данные обратно во все предыдущие разделы'],
];

const sectionIds = [
  ['strategy-map', 'Стратегическая карта'],
  ['hypotheses', 'Гипотезы'],
  ['experiments', 'Проверки'],
  ['decisions', 'Решения'],
  ['okr-kpi', 'OKR / KPI'],
  ['initiatives', 'Инициативы'],
  ['business-processes', 'Бизнес-процессы'],
  ['tasks', 'Задачи'],
  ['facts-learning', 'Факты и обучение'],
];

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
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

interface ProjectWholeProjectCanvasProps {
  projectId: number;
}

export default function ProjectWholeProjectCanvas({ projectId }: ProjectWholeProjectCanvasProps) {
  const theory = useMemo(() => readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId), [projectId]);
  const diagnosis = useMemo(() => readProjectDiagnosisSnapshot(projectId) || getFallbackProjectDiagnosisSnapshot(projectId), [projectId]);
  const strategy = useMemo(() => readProjectStrategicChoiceSnapshot(projectId) || getFallbackProjectStrategicChoiceSnapshot(projectId), [projectId]);
  const target = useMemo(() => readProjectTargetStateSnapshot(projectId) || getFallbackProjectTargetStateSnapshot(projectId), [projectId]);
  const sectionSnapshots = useMemo(
    () => sectionIds.map(([id, title]) => ({ id, title, snapshot: readProjectFrameworkSectionSnapshot(projectId, id) })),
    [projectId],
  );

  const checks = [
    ['Теория проекта задает исходную модель', theory.blocks.some(block => hasText(block.expectedState))],
    ['Диагноз связан с реальным препятствием', hasText(diagnosis.keyChallenge) || hasText(diagnosis.finalStatement)],
    ['Стратегический выбор отвечает на диагноз', hasText(strategy.acceptedChoice) || hasText(strategy.guidingPolicy) || hasText(strategy.howToWin)],
    ['Целевое состояние описывает будущую систему', hasText(target.finalStatement) || hasText(target.statement)],
    ['Стратегическая карта разложила цель причинно-следственно', Boolean(sectionSnapshots.find(item => item.id === 'strategy-map')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Гипотезы выделены как проверяемые предположения', Boolean(sectionSnapshots.find(item => item.id === 'hypotheses')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Проверки превращают гипотезы в факты', Boolean(sectionSnapshots.find(item => item.id === 'experiments')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Решения опираются на проверки или факты', Boolean(sectionSnapshots.find(item => item.id === 'decisions')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['OKR / KPI измеряют движение к цели', Boolean(sectionSnapshots.find(item => item.id === 'okr-kpi')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Инициативы поддерживают цели и выбор', Boolean(sectionSnapshots.find(item => item.id === 'initiatives')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Бизнес-процессы производят результат', Boolean(sectionSnapshots.find(item => item.id === 'business-processes')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Задачи имеют accountable assignments', Boolean(sectionSnapshots.find(item => item.id === 'tasks')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
    ['Факты и обучение замыкают обратную связь', Boolean(sectionSnapshots.find(item => item.id === 'facts-learning')?.snapshot?.items.some(card => card.status !== 'не заполнено'))],
  ];
  const completed = checks.filter(([, value]) => value).length;
  const readiness = completed === checks.length ? 'Фреймворк связан полностью' : completed >= 8 ? 'Фреймворк связан частично' : 'Нужна настройка ключевых разделов';

  return (
    <div className="project-theory project-whole-project">
      <section className="project-theory-hero">
        <div>
          <span>Проекты / Весь проект</span>
          <h2>Весь проект</h2>
          <p>Финальная проверка связанного графа: от Теории проекта до Фактов и обучения с обратной связью во все предыдущие разделы.</p>
        </div>
        <label className="project-theory-field compact">
          <span>Готовность</span>
          <input className="form-input" value={`${completed} из ${checks.length}: ${readiness}`} readOnly />
        </label>
      </section>

      <Section number="1" title="Сквозная зависимость" note="Это не линейная анкета, а граф управления проектной стратегией.">
        <div className="project-theory-repeater">
          {projectFlow.map(([title, note], index) => (
            <div className="project-diagnosis-relation" key={title}>
              <b>{index + 1}. {title}</b>
              <span>{note}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section number="2" title="Статусы разделов" note="Проверка читает snapshots экранов по id проекта и показывает, где уже есть заполненные сущности.">
        <div className="project-strategy-sources">
          <div className="project-strategy-source-card">
            <span>Теория проекта</span>
            <strong>{theory.blocks.filter(block => hasText(block.expectedState)).length} из {theory.blocks.length} блоков</strong>
            <em>Исходная модель проекта</em>
          </div>
          <div className="project-strategy-source-card">
            <span>Диагноз</span>
            <strong>{diagnosis.finalStatement || diagnosis.keyChallenge || 'не заполнено'}</strong>
            <em>Главное препятствие и факты</em>
          </div>
          <div className="project-strategy-source-card">
            <span>Стратегический выбор</span>
            <strong>{strategy.acceptedChoice || strategy.guidingPolicy || 'не заполнено'}</strong>
            <em>Where/how/capabilities/systems/trade-offs</em>
          </div>
          <div className="project-strategy-source-card">
            <span>Целевое состояние</span>
            <strong>{target.finalStatement || target.statement || 'не заполнено'}</strong>
            <em>Будущая система и key results</em>
          </div>
          {sectionSnapshots.map(item => (
            <div className="project-strategy-source-card" key={item.id}>
              <span>{item.title}</span>
              <strong>{item.snapshot ? `${item.snapshot.items.filter(card => card.status !== 'не заполнено').length} карточек` : 'не заполнено'}</strong>
              <em>{item.snapshot ? `${item.snapshot.completedChecks} из ${item.snapshot.totalChecks} проверок` : 'snapshot еще не создан'}</em>
            </div>
          ))}
        </div>
      </Section>

      <Section number="3" title="Финальная методологическая проверка" note="Все ключевые связи должны быть представлены хотя бы одной заполненной сущностью или формулировкой.">
        <div className="project-theory-validation-list">
          {checks.map(([label, value]) => (
            <label className="project-theory-validation-item" key={String(label)}>
              <input type="checkbox" checked={Boolean(value)} readOnly />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
