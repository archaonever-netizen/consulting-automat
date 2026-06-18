import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Icon from '../Icon';
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
    ['objective сформулирован как направление, не задача', objectives.some(objective => hasText(objective.objective))],
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
      label: objective.name.trim() || objective.objective.trim() || `Objective ${index + 1}`,
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

  const [objectives, setObjectives] = useState<ObjectiveCard[]>(() => buildInitialObjectives(target));

  const validationChecks = buildOkrValidationChecks(objectives);
  const completedChecks = validationChecks.filter(([, value]) => value).length;

  useEffect(() => {
    writeProjectFrameworkSectionSnapshot(projectId, SECTION_ID, buildOkrSnapshot(projectId, objectives));
  }, [objectives, projectId]);

  function updateObjective(id: number, patch: Partial<ObjectiveCard>) {
    setObjectives(current => current.map(objective => objective.id === id ? { ...objective, ...patch } : objective));
  }

  function updateKeyResult(objectiveId: number, krId: number, patch: Partial<KeyResultRow>) {
    setObjectives(current => current.map(objective => objective.id === objectiveId
      ? { ...objective, keyResults: objective.keyResults.map(kr => kr.id === krId ? { ...kr, ...patch } : kr) }
      : objective));
  }

  function updateKpi(objectiveId: number, kpiId: number, patch: Partial<KpiRow>) {
    setObjectives(current => current.map(objective => objective.id === objectiveId
      ? { ...objective, kpis: objective.kpis.map(kpi => kpi.id === kpiId ? { ...kpi, ...patch } : kpi) }
      : objective));
  }

  function addKeyResult(objectiveId: number) {
    setObjectives(current => current.map(objective => objective.id === objectiveId
      ? { ...objective, keyResults: [...objective.keyResults, createKeyResult(nextId(objective.keyResults))] }
      : objective));
  }

  function addKpi(objectiveId: number) {
    setObjectives(current => current.map(objective => objective.id === objectiveId
      ? { ...objective, kpis: [...objective.kpis, createKpi(nextId(objective.kpis))] }
      : objective));
  }

  return (
    <div className="project-theory project-framework-section">
      <section className="project-theory-hero">
        <div>
          <span>Проекты / OKR / KPI</span>
          <h2>OKR / KPI</h2>
          <p>OKR / KPI переводят стратегию, целевое состояние и решения в измеримые цели, key results и показатели контроля.</p>
        </div>
        <label className="project-theory-field compact">
          <span>Методологическая проверка</span>
          <input className="form-input" value={`${completedChecks} из ${validationChecks.length}`} readOnly />
        </label>
      </section>

      <Section number="0" title="Связь с предыдущими разделами" note="Целевое состояние / Стратегическая карта / Решения / Инициативы → OKR / KPI">
        <div className="project-strategy-sources">
          <div className="project-strategy-source-card">
            <span>Целевое состояние</span>
            <strong>{target.objective || target.finalStatement || 'Сначала заполните Целевое состояние'}</strong>
            <em>Objective должен вытекать из будущей системы.</em>
          </div>
          <div className="project-strategy-source-card">
            <span>Критерии результата</span>
            <strong>{resultOptions.join(', ') || 'Сначала заполните критерии результата'}</strong>
            <em>KR и KPI должны иметь источник контроля.</em>
          </div>
        </div>
      </Section>

      <Section number="1" title="Objective" note="Повторяемая карточка: цель — качественное направление, а не метрика. Внутри — вложенные Key Results и KPI.">
        <div className="project-theory-repeater">
          {objectives.map((objective, index) => (
            <div className="project-theory-card" key={objective.id}>
              <div className="project-theory-card-title">
                <input
                  className="form-input project-card-name-input"
                  placeholder={`Objective ${index + 1}`}
                  value={objective.name}
                  onChange={event => updateObjective(objective.id, { name: event.target.value })}
                />
                <span>{objectiveStatus(objective)}</span>
              </div>
              <div className="project-theory-grid two">
                <TextField label="Источник objective" options={objectiveSourceOptions} value={objective.source} onChange={value => updateObjective(objective.id, { source: value })} />
                <TextField label="Уровень" options={levelOptions} value={objective.level} onChange={value => updateObjective(objective.id, { level: value })} />
                <TextField label="Формулировка objective" multiline placeholder="Качественное направление, не задача и не метрика" value={objective.objective} onChange={value => updateObjective(objective.id, { objective: value })} />
                <TextField label="Период" options={periodOptions} value={objective.period} onChange={value => updateObjective(objective.id, { period: value })} />
                <TextField label="Владелец" placeholder="Роль / пользователь" value={objective.owner} onChange={value => updateObjective(objective.id, { owner: value })} />
                <TextField label="CFR / управленческий ритм" multiline placeholder="Conversations / feedback / recognition" value={objective.rhythm} onChange={value => updateObjective(objective.id, { rhythm: value })} />
              </div>

              <div className="project-theory-card-title">Связанные Key Results</div>
              <div className="project-theory-repeater">
                {objective.keyResults.map((kr, krIndex) => (
                  <div className="project-theory-card" key={kr.id}>
                    <div className="project-theory-card-title">
                      <input
                        className="form-input project-card-name-input"
                        placeholder={`Key Result ${krIndex + 1}`}
                        value={kr.name}
                        onChange={event => updateKeyResult(objective.id, kr.id, { name: event.target.value })}
                      />
                    </div>
                    <div className="project-theory-grid two">
                      <TextField label="Формулировка KR" multiline value={kr.statement} onChange={value => updateKeyResult(objective.id, kr.id, { statement: value })} />
                      <TextField label="Метрика" value={kr.metric} onChange={value => updateKeyResult(objective.id, kr.id, { metric: value })} />
                      <TextField label="Базовое значение" value={kr.baseline} onChange={value => updateKeyResult(objective.id, kr.id, { baseline: value })} />
                      <TextField label="Целевое значение" value={kr.target} onChange={value => updateKeyResult(objective.id, kr.id, { target: value })} />
                      <TextField label="Единица измерения" value={kr.unit} onChange={value => updateKeyResult(objective.id, kr.id, { unit: value })} />
                      <TextField label="Источник контроля" options={commonDataSources} value={kr.controlSource} onChange={value => updateKeyResult(objective.id, kr.id, { controlSource: value })} />
                      <TextField label="Частота трекинга" value={kr.frequency} onChange={value => updateKeyResult(objective.id, kr.id, { frequency: value })} />
                      <TextField label="Текущий прогресс" value={kr.progress} onChange={value => updateKeyResult(objective.id, kr.id, { progress: value })} />
                      <TextField label="Статус" options={krStatusOptions} value={kr.status} onChange={value => updateKeyResult(objective.id, kr.id, { status: value })} />
                    </div>
                  </div>
                ))}
                <button className="project-theory-add-card" type="button" onClick={() => addKeyResult(objective.id)}>
                  <Icon name="plus" size={16} />
                  Добавить Key Result
                </button>
              </div>

              <div className="project-theory-card-title">Связанные KPI</div>
              <div className="project-theory-repeater">
                {objective.kpis.map((kpi, kpiIndex) => (
                  <div className="project-theory-card" key={kpi.id}>
                    <div className="project-theory-card-title">
                      <input
                        className="form-input project-card-name-input"
                        placeholder={`KPI ${kpiIndex + 1}`}
                        value={kpi.name}
                        onChange={event => updateKpi(objective.id, kpi.id, { name: event.target.value })}
                      />
                    </div>
                    <div className="project-theory-grid two">
                      <TextField label="Показатель" value={kpi.indicator} onChange={value => updateKpi(objective.id, kpi.id, { indicator: value })} />
                      <TextField label="Формула" value={kpi.formula} onChange={value => updateKpi(objective.id, kpi.id, { formula: value })} />
                      <TextField label="Целевое значение" value={kpi.target} onChange={value => updateKpi(objective.id, kpi.id, { target: value })} />
                      <TextField label="Факт" value={kpi.fact} onChange={value => updateKpi(objective.id, kpi.id, { fact: value })} />
                      <TextField label="Допустимое отклонение" value={kpi.tolerance} onChange={value => updateKpi(objective.id, kpi.id, { tolerance: value })} />
                      <TextField label="Источник данных" options={commonDataSources} value={kpi.dataSource} onChange={value => updateKpi(objective.id, kpi.id, { dataSource: value })} />
                      <TextField label="Частота измерения" value={kpi.frequency} onChange={value => updateKpi(objective.id, kpi.id, { frequency: value })} />
                      <TextField label="Владелец" placeholder="Роль / пользователь" value={kpi.owner} onChange={value => updateKpi(objective.id, kpi.id, { owner: value })} />
                    </div>
                  </div>
                ))}
                <button className="project-theory-add-card" type="button" onClick={() => addKpi(objective.id)}>
                  <Icon name="plus" size={16} />
                  Добавить KPI
                </button>
              </div>
            </div>
          ))}
          <button className="project-theory-add-card" type="button" onClick={() => setObjectives(current => [...current, createObjective(nextId(current))])}>
            <Icon name="plus" size={16} />
            Добавить objective
          </button>
        </div>
      </Section>

      <Section number="2" title="Методологическая проверка" note="Objective — направление, KR измеримы и отслеживаются, KPI связан со стратегией.">
        <div className="project-theory-validation-list">
          {validationChecks.map(([label, value]) => (
            <label className="project-theory-validation-item" key={label}>
              <input type="checkbox" checked={value} readOnly />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </Section>
    </div>
  );
}
