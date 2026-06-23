import { Suspense, lazy, useMemo } from 'react';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { getFallbackProjectStrategicChoiceSnapshot, readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { getFallbackProjectTargetStateSnapshot, readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot } from './projectTheorySnapshot';

// React Flow + dagre — тяжёлые, грузим лениво только на этом экране (отдельный бандл-чанк).
const ProjectDependencyGraph = lazy(() => import('./ProjectDependencyGraph'));

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

interface ProjectWholeProjectCanvasProps {
  projectId: number;
  // Открыть каркасную карточку (клик по узлу графа).
  onSelectCard?: (cardId: string) => void;
}

export default function ProjectWholeProjectCanvas({ projectId, onSelectCard }: ProjectWholeProjectCanvasProps) {
  const theory = useMemo(() => readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId), [projectId]);
  const diagnosis = useMemo(() => readProjectDiagnosisSnapshot(projectId) || getFallbackProjectDiagnosisSnapshot(projectId), [projectId]);
  const strategy = useMemo(() => readProjectStrategicChoiceSnapshot(projectId) || getFallbackProjectStrategicChoiceSnapshot(projectId), [projectId]);
  const target = useMemo(() => readProjectTargetStateSnapshot(projectId) || getFallbackProjectTargetStateSnapshot(projectId), [projectId]);
  const sectionSnapshots = useMemo(
    () => sectionIds.map(([id, title]) => ({ id, title, snapshot: readProjectFrameworkSectionSnapshot(projectId, id) })),
    [projectId],
  );

  const sectionFilled = (id: string) =>
    Boolean(sectionSnapshots.find(item => item.id === id)?.snapshot?.items.some(card => card.status !== 'не заполнено'));

  const checks = [
    theory.blocks.some(block => hasText(block.expectedState)),
    hasText(diagnosis.keyChallenge) || hasText(diagnosis.finalStatement),
    hasText(strategy.acceptedChoice) || hasText(strategy.guidingPolicy) || hasText(strategy.howToWin),
    hasText(target.finalStatement) || hasText(target.statement),
    sectionFilled('strategy-map'),
    sectionFilled('hypotheses'),
    sectionFilled('experiments'),
    sectionFilled('decisions'),
    sectionFilled('okr-kpi'),
    sectionFilled('initiatives'),
    sectionFilled('business-processes'),
    sectionFilled('tasks'),
    sectionFilled('facts-learning'),
  ];
  const completed = checks.filter(Boolean).length;
  const readiness = completed === checks.length ? 'Фреймворк связан полностью' : completed >= 8 ? 'Фреймворк связан частично' : 'Нужна настройка ключевых разделов';

  return (
    <div className="project-theory project-whole-project">
      <section className="project-theory-hero">
        <div>
          <span>Проекты / Весь проект</span>
          <h2>Весь проект</h2>
          <p>Верхний слой — карточки-разделы проекта; пока это «Теория проекта», из неё выходит Миссия (позже сюда добавятся остальные экраны). Из Миссии вытекают блоки Теории — клиент, критерии результата, компетенции, ограничения, качество и сохраняемое ядро. Раскройте блок, чтобы увидеть элементы. Наведите на узел — связи подсветятся временно; кликните — закрепятся (повторный клик снимает, клик по пустому полю — снимает все). Двойной клик открывает раздел.</p>
        </div>
        <label className="project-theory-field compact">
          <span>Готовность</span>
          <input className="form-input" value={`${completed} из ${checks.length}: ${readiness}`} readOnly />
        </label>
      </section>

      <Suspense fallback={<div className="project-graph project-graph-loading"><span className="spinner" /><span>Загрузка графа…</span></div>}>
        <ProjectDependencyGraph projectId={projectId} onOpenCard={onSelectCard ?? (() => {})} />
      </Suspense>
    </div>
  );
}
