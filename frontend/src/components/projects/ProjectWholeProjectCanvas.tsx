import { Suspense, lazy, useMemo } from 'react';
import { getFallbackProjectDiagnosisSnapshot, readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { getFallbackProjectStrategicChoiceSnapshot, readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { getFallbackProjectTargetStateSnapshot, readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot } from './projectTheorySnapshot';
import { EDGE_FAMILIES, ENTITY_COLORS, RELATION_FAMILIES, SEMANTIC_DASH } from './projectTheoryGraph';

// React Flow + dagre — тяжёлые, грузим лениво только на этом экране (отдельный бандл-чанк).
const ProjectDependencyGraph = lazy(() => import('./ProjectDependencyGraph'));

// Образец линии связи для легенды (цвет + пунктир + толщина как на графе).
function LineSample({ color, dash, width = 2.5 }: { color: string; dash: string; width?: number }) {
  return (
    <svg className="pg-legend-line" width="34" height="10" aria-hidden="true">
      <line x1="1" y1="5" x2="33" y2="5" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={dash || undefined} />
    </svg>
  );
}

// Легенда из визуальной грамматики: РОД линии (пунктир/толщина) + ЦВЕТ (= сущность-цель),
// затем сами связи (точную семантику несёт подпись). Грамматика — масштабируемая часть.
function ConnectionsLegend() {
  return (
    <section className="pg-legend">
      <div className="pg-legend-group">
        <span className="pg-legend-title">Род линии</span>
        {EDGE_FAMILIES.map(f => (
          <span className="pg-legend-item" key={f.family}>
            <LineSample color="#64748b" dash={f.dash} width={f.width} /><b>{f.title}</b>
          </span>
        ))}
      </div>
      <div className="pg-legend-group">
        <span className="pg-legend-title">Цвет = сущность</span>
        {ENTITY_COLORS.map(e => (
          <span className="pg-legend-item" key={e.list}>
            <LineSample color={e.color} dash="" width={3} /><b>{e.title}</b>
          </span>
        ))}
      </div>
      <div className="pg-legend-group">
        <span className="pg-legend-title">Принцип связей</span>
        {RELATION_FAMILIES.map(f => (
          <span className="pg-legend-item" key={f.id}>
            <LineSample color={f.color} dash={SEMANTIC_DASH} width={2} /><b>{f.label}</b>
            <span className="pg-legend-meta">{f.about}</span>
          </span>
        ))}
      </div>
      <p className="pg-legend-note">Точный глагол связи («контролирует», «обеспечивает»…) — по наведению на саму связь.</p>
    </section>
  );
}

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
  // Открыть каркасную карточку (двойной клик по узлу графа) и опционально
  // центрировать раздел на конкретном блоке/элементе.
  onSelectCard?: (cardId: string, focus?: { list?: string; itemId?: string }) => void;
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
          <p>Верхний слой — карточки-разделы в методологической цепочке «Теория проекта → Диагноз → Стратегический выбор»: из каждой выходит её корень (Миссия / Диагностическое суждение / Принятый выбор), из корня — блоки раздела. Кросс-связи показывают, как разделы держатся друг за друга (например, разрыв Диагноза проверяет конкретный блок Теории). Раскрывайте блоки, чтобы видеть элементы. Наведение на узел подсвечивает связи временно, клик — закрепляет (повторный клик/клик по полю — снимает), двойной клик по узлу открывает раздел. Связь тоже можно навести или кликнуть, чтобы зафиксировать. Визуальный язык: цвет линии = сущность-цель, тип линии = род связи, а подпись по умолчанию показывает семейство связи (принцип) — точный глагол открывается по наведению на связь (см. легенду ниже).</p>
        </div>
        <label className="project-theory-field compact">
          <span>Готовность</span>
          <input className="form-input" value={`${completed} из ${checks.length}: ${readiness}`} readOnly />
        </label>
      </section>

      <ConnectionsLegend />

      <Suspense fallback={<div className="project-graph project-graph-loading"><span className="spinner" /><span>Загрузка графа…</span></div>}>
        <ProjectDependencyGraph projectId={projectId} onOpenCard={onSelectCard ?? (() => {})} />
      </Suspense>
    </div>
  );
}
