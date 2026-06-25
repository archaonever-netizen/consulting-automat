import { useEffect, useMemo, useState, type ReactNode } from 'react';
import DraftCard from './DraftCard';
import Icon from '../Icon';
import ProjectDisclosure from './ProjectDisclosure';
import { readProjectFrameworkSectionSnapshot, writeProjectFrameworkSectionSnapshot, type ProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { getFallbackProjectTargetStateSnapshot, readProjectTargetStateSnapshot, type ProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { getFallbackProjectTheorySnapshot, readProjectTheorySnapshot } from './projectTheorySnapshot';

const SECTION_ID = 'okr-kpi';

const objectiveSourceOptions = ['миссия', 'стратегический выбор', 'целевое состояние', 'стратегическая карта', 'инициатива'];
const levelOptions = ['проект', 'команда', 'роль', 'человек'];
const periodOptions = ['квартал', 'месяц', 'другой цикл'];
const krStatusOptions = ['не начато', 'в работе', 'на риске', 'достигнут', 'отменён'];
const commonDataSources = ['CRM', 'финансы', 'HR', 'операционный отчет', 'аудит', 'опрос', 'акт приемки', 'системная аналитика', 'дашборд'];

type KeyResultRow = {
  id: number;
  name: string;
  statement: string;
  metric: string;
  baseline: string;
  target: string;
  unit: string;
  controlSource: string;
  frequency: string;
  progress: string;
  status: string;
};

type KpiRow = {
  id: number;
  name: string;
  indicator: string;
  formula: string;
  target: string;
  fact: string;
  tolerance: string;
  dataSource: string;
  frequency: string;
  owner: string;
};

type ObjectiveCard = {
  id: number;
  name: string;
  source: string;
  objective: string;
  level: string;
  period: string;
  owner: string;
  rhythm: string;
  keyResults: KeyResultRow[];
  kpis: KpiRow[];
};

function hasText(value: string | undefined) {
  return Boolean(value?.trim());
}

function compactJoin(values: Array<string | undefined>) {
  return values.map(value => value?.trim()).filter(Boolean).join('; ');
}

function nextId(rows: Array<{ id: number }>) {
  return rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

function createKeyResult(id: number, statement = ''): KeyResultRow {
  return { id, name: '', statement, metric: '', baseline: '', target: '', unit: '', controlSource: '', frequency: '', progress: '', status: '' };
}

function createKpi(id: number): KpiRow {
  return { id, name: '', indicator: '', formula: '', target: '', fact: '', tolerance: '', dataSource: '', frequency: '', owner: '' };
}

function createObjective(id: number, prefill?: Partial<ObjectiveCard>): ObjectiveCard {
  return {
    id,
    name: '',
    source: 'целевое состояние',
    objective: '',
    level: 'проект',
    period: '',
    owner: '',
    rhythm: '',
    keyResults: [createKeyResult(1)],
    kpis: [createKpi(1)],
    ...prefill,
  };
}

function objectiveStatus(objective: ObjectiveCard) {
  const hasObjective = hasText(objective.objective);
  const hasMeasurableKr = objective.keyResults.some(kr => hasText(kr.metric) && hasText(kr.target));
  if (!hasObjective && !hasMeasurableKr) return 'не заполнено';
  if (hasObjective && hasText(objective.owner) && hasText(objective.period) && hasMeasurableKr) return 'валидно';
  return 'заполнено частично';
}

function buildInitialObjectives(target: ProjectTargetStateSnapshot): ObjectiveCard[] {
  const seededKrs = target.keyResults.length
    ? target.keyResults.map((kr, index) => createKeyResult(index + 1, kr.label))
    : [createKeyResult(1)];
  return [createObjective(1, {
    objective: target.objective || target.statement || '',
    keyResults: seededKrs,
  })];
}

function buildOkrValidationChecks(objectives: ObjectiveCard[]): Array<[string, boolean]> {
  return [
    ['цель сформулирована как направление, не задача', objectives.some(objective => hasText(objective.objective))],
    ['KR измеримы (есть метрика и целевое значение)', objectives.some(objective => objective.keyResults.some(kr => hasText(kr.metric) && hasText(kr.target)))],
    ['есть источник данных', objectives.some(objective => objective.keyResults.some(kr => hasText(kr.controlSource)) || objective.kpis.some(kpi => hasText(kpi.dataSource)))],
    ['есть владелец', objectives.some(objective => hasText(objective.owner))],
    ['есть период', objectives.some(objective => hasText(objective.period))],
    ['есть трекинг прогресса', objectives.some(objective => objective.keyResults.some(kr => hasText(kr.frequency) || hasText(kr.progress)))],
    ['KPI связан со стратегией (указан источник objective)', objectives.some(objective => hasText(objective.source))],
  ];
}

function buildOkrSnapshot(projectId: number, objectives: ObjectiveCard[]): ProjectFrameworkSectionSnapshot {
  const checks = buildOkrValidationChecks(objectives);
  return {
    projectId,
    sectionId: SECTION_ID,
    title: 'OKR / KPI',
    updatedAt: new Date().toISOString(),
    items: objectives.map((objective, index) => ({
      id: String(objective.id),
      label: objective.name.trim() || objective.objective.trim() || `Цель ${index + 1}`,
      summary: compactJoin([
        objective.level,
        objective.period,
        objective.owner,
        `${objective.keyResults.filter(kr => hasText(kr.statement)).length} KR`,
        `${objective.kpis.filter(kpi => hasText(kpi.indicator)).length} KPI`,
      ]),
      status: objectiveStatus(objective),
    })),
    completedChecks: checks.filter(([, value]) => value).length,
    totalChecks: checks.length,
    form: objectives,
  };
}

// Seeds the OKR snapshot for projects where the screen has not been opened yet,
// so «Весь проект» reflects the objective/KR prefilled from Целевое состояние. Never overwrites user data.
export function seedOkrSnapshot(projectId: number) {
  if (readProjectFrameworkSectionSnapshot(projectId, SECTION_ID)) return;
  const target = readProjectTargetStateSnapshot(projectId) || getFallbackProjectTargetStateSnapshot(projectId);
  writeProjectFrameworkSectionSnapshot(projectId, SECTION_ID, buildOkrSnapshot(projectId, buildInitialObjectives(target)));
}

function TextField({
  label,
  value,
  onChange,
  options,
  multiline = false,
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="project-theory-field">
      <span>{label}</span>
      {options ? (
        <select className="form-select" value={value} onChange={event => onChange(event.target.value)}>
          <option value="">Выберите значение</option>
          {options.map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : multiline ? (
        <textarea className="form-textarea" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      ) : (
        <input className="form-input" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      )}
    </label>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="project-theory-section">
      <div className="project-theory-section-head">
        <div>
          <h3>{title}</h3>
          {note && <p>{note}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

interface ProjectOkrCanvasProps {
  projectId: number;
}

export default function ProjectOkrCanvas({ projectId }: ProjectOkrCanvasProps) {
  const theory = useMemo(() => readProjectTheorySnapshot(projectId) || getFallbackProjectTheorySnapshot(projectId), [projectId]);
  const target = useMemo(() => readProjectTargetStateSnapshot(projectId) || getFallbackProjectTargetStateSnapshot(projectId), [projectId]);

  const resultOptions = useMemo(
    () => theory.blocks.find(block => block.id === 'results')?.items.map(item => item.label).filter(Boolean) || [],
    [theory],
  );

  const [objectives, setObjectives] = useState<ObjectiveCard[]>(() => {
    const savedForm = readProjectFrameworkSectionSnapshot(projectId, SECTION_ID)?.form as ObjectiveCard[] | undefined;
    return savedForm?.length ? savedForm : buildInitialObjectives(target);
  });

  const validationChecks = buildOkrValidationChecks(objectives);
  const completedChecks = validationChecks.filter(([, value]) => value).length;

  useEffect(() => {
    const timer = setTimeout(() => {
      writeProjectFrameworkSectionSnapshot(projectId, SECTION_ID, buildOkrSnapshot(projectId, objectives));
    }, 400);
    return () => clearTimeout(timer);
  }, [objectives, projectId]);

  return (
    <div className="project-theory project-framework-section">
      <section className="project-theory-hero">
        <div>
          <h2>OKR / KPI</h2>
          <p>OKR / KPI переводят стратегию, целевое состояние и решения в измеримые цели, ключевые результаты и показатели контроля.</p>
        </div>
        <span className="project-readiness-pill">Готовность {completedChecks}/{validationChecks.length}</span>
      </section>

      <ProjectDisclosure title="Контекст — откуда берутся данные">
        <p className="project-disclosure-dependency">Целевое состояние / Стратегическая карта / Решения / Инициативы → OKR / KPI</p>
        <div className="project-strategy-source-grid">
          <div className="project-strategy-source-card">
            <span>Целевое состояние</span>
            <strong>{target.objective || target.finalStatement || 'Сначала заполните Целевое состояние'}</strong>
            <em>Цель должна вытекать из будущей системы.</em>
          </div>
          <div className="project-strategy-source-card">
            <span>Критерии результата</span>
            <strong>{resultOptions.join(', ') || 'Сначала заполните критерии результата'}</strong>
            <em>KR и KPI должны иметь источник контроля.</em>
          </div>
        </div>
      </ProjectDisclosure>

      <Section title="Цели">
        <div className="project-theory-repeater">
          {objectives.map((objective, index) => (
            <DraftCard
              key={objective.id}
              card={objective}
              title={`Цель ${index + 1}`}
              onApply={next => setObjectives(current => current.map(item => item.id === next.id ? next : item))}
            >
              {(draft, patch) => {
                const updateKr = (krId: number, krPatch: Partial<KeyResultRow>) => patch({ keyResults: draft.keyResults.map(kr => kr.id === krId ? { ...kr, ...krPatch } : kr) });
                const updateKpiRow = (kpiId: number, kpiPatch: Partial<KpiRow>) => patch({ kpis: draft.kpis.map(kpi => kpi.id === kpiId ? { ...kpi, ...kpiPatch } : kpi) });
                const addKr = () => patch({ keyResults: [...draft.keyResults, createKeyResult(nextId(draft.keyResults))] });
                const addKpiRow = () => patch({ kpis: [...draft.kpis, createKpi(nextId(draft.kpis))] });
                return (
                  <>
                    <label className="project-theory-field">
                      <span>Название цели</span>
                      <input
                        className="form-input"
                        placeholder={`Цель ${index + 1}`}
                        value={draft.name}
                        onChange={event => patch({ name: event.target.value })}
                      />
                    </label>
                    <div className="project-theory-grid two">
                      <TextField label="Источник цели" options={objectiveSourceOptions} value={draft.source} onChange={value => patch({ source: value })} />
                      <TextField label="Уровень" options={levelOptions} value={draft.level} onChange={value => patch({ level: value })} />
                      <TextField label="Формулировка цели" multiline placeholder="Качественное направление, не задача и не метрика" value={draft.objective} onChange={value => patch({ objective: value })} />
                      <TextField label="Период" options={periodOptions} value={draft.period} onChange={value => patch({ period: value })} />
                      <TextField label="Владелец" placeholder="Роль / пользователь" value={draft.owner} onChange={value => patch({ owner: value })} />
                      <TextField label="CFR / управленческий ритм" multiline placeholder="Беседы / обратная связь / признание" value={draft.rhythm} onChange={value => patch({ rhythm: value })} />
                    </div>

                    <div className="project-theory-card-title">Связанные ключевые результаты</div>
                    <div className="project-theory-repeater">
                      {draft.keyResults.map((kr, krIndex) => (
                        <div className="project-theory-card" key={kr.id}>
                          <div className="project-theory-card-title">
                            <input
                              className="form-input project-card-name-input"
                              placeholder={`Ключевой результат ${krIndex + 1}`}
                              value={kr.name}
                              onChange={event => updateKr(kr.id, { name: event.target.value })}
                            />
                          </div>
                          <div className="project-theory-grid two">
                            <TextField label="Формулировка KR" multiline value={kr.statement} onChange={value => updateKr(kr.id, { statement: value })} />
                            <TextField label="Метрика" value={kr.metric} onChange={value => updateKr(kr.id, { metric: value })} />
                            <TextField label="Базовое значение" value={kr.baseline} onChange={value => updateKr(kr.id, { baseline: value })} />
                            <TextField label="Целевое значение" value={kr.target} onChange={value => updateKr(kr.id, { target: value })} />
                            <TextField label="Единица измерения" value={kr.unit} onChange={value => updateKr(kr.id, { unit: value })} />
                            <TextField label="Источник контроля" options={commonDataSources} value={kr.controlSource} onChange={value => updateKr(kr.id, { controlSource: value })} />
                            <TextField label="Частота трекинга" value={kr.frequency} onChange={value => updateKr(kr.id, { frequency: value })} />
                            <TextField label="Текущий прогресс" value={kr.progress} onChange={value => updateKr(kr.id, { progress: value })} />
                            <TextField label="Статус" options={krStatusOptions} value={kr.status} onChange={value => updateKr(kr.id, { status: value })} />
                          </div>
                        </div>
                      ))}
                      <button className="project-theory-add-card" type="button" onClick={addKr}>
                        <Icon name="plus" size={16} />
                        Добавить ключевой результат
                      </button>
                    </div>

                    <div className="project-theory-card-title">Связанные KPI</div>
                    <div className="project-theory-repeater">
                      {draft.kpis.map((kpi, kpiIndex) => (
                        <div className="project-theory-card" key={kpi.id}>
                          <div className="project-theory-card-title">
                            <input
                              className="form-input project-card-name-input"
                              placeholder={`KPI ${kpiIndex + 1}`}
                              value={kpi.name}
                              onChange={event => updateKpiRow(kpi.id, { name: event.target.value })}
                            />
                          </div>
                          <div className="project-theory-grid two">
                            <TextField label="Показатель" value={kpi.indicator} onChange={value => updateKpiRow(kpi.id, { indicator: value })} />
                            <TextField label="Формула" value={kpi.formula} onChange={value => updateKpiRow(kpi.id, { formula: value })} />
                            <TextField label="Целевое значение" value={kpi.target} onChange={value => updateKpiRow(kpi.id, { target: value })} />
                            <TextField label="Факт" value={kpi.fact} onChange={value => updateKpiRow(kpi.id, { fact: value })} />
                            <TextField label="Допустимое отклонение" value={kpi.tolerance} onChange={value => updateKpiRow(kpi.id, { tolerance: value })} />
                            <TextField label="Источник данных" options={commonDataSources} value={kpi.dataSource} onChange={value => updateKpiRow(kpi.id, { dataSource: value })} />
                            <TextField label="Частота измерения" value={kpi.frequency} onChange={value => updateKpiRow(kpi.id, { frequency: value })} />
                            <TextField label="Владелец" placeholder="Роль / пользователь" value={kpi.owner} onChange={value => updateKpiRow(kpi.id, { owner: value })} />
                          </div>
                        </div>
                      ))}
                      <button className="project-theory-add-card" type="button" onClick={addKpiRow}>
                        <Icon name="plus" size={16} />
                        Добавить KPI
                      </button>
                    </div>
                  </>
                );
              }}
            </DraftCard>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setObjectives(current => [...current, createObjective(nextId(current))])}>
            <Icon name="plus" size={16} />
            Добавить цель
          </button>
        </div>
      </Section>

      <ProjectDisclosure title="Проверка готовности" count={`${completedChecks} из ${validationChecks.length}`}>
        <div className="project-theory-validation-grid">
          {validationChecks.map(([label, value]) => (
            <label className="project-theory-validation-item" key={label}>
              <input type="checkbox" checked={value} readOnly />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </ProjectDisclosure>
    </div>
  );
}

// === Экспорт строительных блоков для применителя правок Методолога (projectOkrCards.ts) ===
// Канвас — единственный источник истины по фабрикам, опциям и сборке снапшота-проекции
// (buildOkrSnapshot); адаптер переиспользует их, чтобы патчи совпадали с живым редактированием.
export {
  createObjective, createKeyResult, createKpi, buildOkrSnapshot,
  objectiveSourceOptions, levelOptions, periodOptions, krStatusOptions, commonDataSources,
};
export type { ObjectiveCard, KeyResultRow, KpiRow };
