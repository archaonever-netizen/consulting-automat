import { useEffect, useMemo, useState } from 'react';
import Icon from '../Icon';
import api from '../../services/api';
import DraftCard from './DraftCard';
import {
  NAME_KEY,
  TextField,
  buildSectionSnapshot,
  createConfigs,
  createRecord,
  readProjectSources,
  type FieldDef,
  type RecordState,
  type ScreenConfig,
} from './ProjectFrameworkSectionCanvas';
import {
  readProjectFrameworkSectionSnapshot,
  writeProjectFrameworkSectionSnapshot,
} from './projectFrameworkSectionSnapshot';
import { buildHypothesisCandidates } from './projectChoiceAssumptionBridge';
import { QUALITY_LABEL, evaluateHypothesisQuality } from './projectHypothesisQuality';
import ProjectAssumptionMap from './ProjectAssumptionMap';
import { MAP_LEVELS, type MapLevel } from './projectHypothesisMap';
import ProjectHypothesisPipeline, { type BlockedMove } from './ProjectHypothesisPipeline';
import { LIFECYCLE_STAGES, type LifecycleStage, lifecycleOf } from './projectHypothesisLifecycle';
import { collectStrategyElements, findBlindZones } from './projectHypothesisCoverage';

const stageLabel = (record: RecordState) =>
  LIFECYCLE_STAGES.find(stage => stage.key === lifecycleOf(record))?.label ?? 'Черновик';

// Новый экран реестра гипотез (Этап 2, PROGRAMMING_INTEGRATION.md). Включается флагом
// hypotheses_workbench; пишет/читает ТОТ ЖЕ снапшот, что старый ProjectFrameworkSectionCanvas,
// поэтому данные общие и переключение между видами безопасно.
const SCREEN_ID = 'hypotheses';

// Поля карточки `hypotheses`, сгруппированные по смыслу (формулировка → проверка → статус).
const FIELD_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Смысл гипотезы', keys: ['source', 'type', 'statement', 'strategicChoice', 'mapNode', 'expectedEffect'] },
  { title: 'Как проверим', keys: ['confirmFact', 'refuteFact', 'dataSource', 'method', 'dueDate', 'owner'] },
  { title: 'Статус', keys: ['status'] },
];

// Поля карты (Этап 3) — живут только в новом экране, в общий конфиг не входят.
const PRIORITY_FIELDS: FieldDef[] = [
  { key: 'importance', label: 'Важность — сколько на этом держится', type: 'select', options: [...MAP_LEVELS] },
  { key: 'uncertainty', label: 'Неизвестность — насколько мы не знаем', type: 'select', options: [...MAP_LEVELS] },
];

function recordLabel(record: RecordState, config: ScreenConfig): string {
  return record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || 'Без названия';
}

// Предложение ИИ-генератора (Этап 5).
interface HypothesisSuggestion {
  name: string;
  statement: string;
  source: string;
  expectedEffect: string;
}

// Компактный контекст проекта (диагностика + выбор + целевое) для ИИ-генератора.
function buildSuggestContext(sources: ReturnType<typeof readProjectSources>): string {
  const { diagnosis: d, strategy: s, target: t } = sources;
  const labels = (items: Array<{ label: string }>) => items.map(item => item.label).filter(Boolean).join('; ');
  return [
    `ДИАГНОСТИКА: ${[d.keyChallenge, d.finalStatement].filter(Boolean).join('. ')}`.trim(),
    d.facts.length ? `Факты диагностики: ${labels(d.facts)}` : '',
    `СТРАТЕГИЧЕСКИЙ ВЫБОР: ${[s.acceptedChoice, s.guidingPolicy, s.howToWin, s.whereToPlay].filter(Boolean).join('. ')}`.trim(),
    s.alternatives.length ? `Альтернативы: ${labels(s.alternatives)}` : '',
    `ЦЕЛЕВОЕ СОСТОЯНИЕ: ${t.finalStatement || ''}`.trim(),
    t.results.length || t.keyResults.length ? `Результаты/KR: ${labels([...t.results, ...t.keyResults])}` : '',
  ].filter(line => line && !line.endsWith(':')).join('\n');
}

export default function ProjectHypothesesWorkbench({ projectId }: { projectId: number }) {
  const sources = useMemo(() => readProjectSources(projectId), [projectId]);
  const config = useMemo(() => createConfigs(sources).hypotheses, [sources]);

  const [records, setRecords] = useState<RecordState[]>(() => {
    const savedForm = readProjectFrameworkSectionSnapshot(projectId, SCREEN_ID)?.form as RecordState[] | undefined;
    if (savedForm?.length) return savedForm;
    return config ? [createRecord(config, sources, 1)] : [];
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<'list' | 'map' | 'pipeline'>('list');
  const [blocked, setBlocked] = useState<BlockedMove | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<HypothesisSuggestion[]>([]);

  // Кандидаты из «Стратвыбора» (мост Этапа 1). Мост дедупит по сохранённому снапшоту,
  // но снапшот пишется с задержкой — поэтому дополнительно исключаем то, что уже есть
  // в текущих (ещё не сохранённых) записях, иначе повторный клик добавил бы дубль.
  const candidates = useMemo(() => {
    const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const present = new Set<string>();
    for (const record of records) {
      const statement = norm(record.values.statement);
      const cardName = norm(record.values[NAME_KEY]);
      if (statement) present.add(statement);
      if (cardName) present.add(cardName);
    }
    return buildHypothesisCandidates(projectId).filter(candidate => {
      const statement = norm(candidate.values.statement);
      const cardName = norm(candidate.values[NAME_KEY]);
      return !(statement && present.has(statement)) && !(cardName && present.has(cardName));
    });
  }, [projectId, records]);

  // Слепые зоны: элементы стратегии (альтернативы выбора + результаты/KR), не покрытые гипотезами.
  const blindZones = useMemo(
    () => findBlindZones(records, collectStrategyElements(sources.strategy.alternatives.map(item => item.label), sources.resultOptions)),
    [records, sources],
  );

  // Автосохранение ТЕМ ЖЕ путём, что и старый канвас (общий снапшот, та же отправка на сервер).
  useEffect(() => {
    if (!config) return;
    const timer = setTimeout(() => {
      writeProjectFrameworkSectionSnapshot(projectId, config.id, buildSectionSnapshot(projectId, config, sources, records));
    }, 400);
    return () => clearTimeout(timer);
  }, [config, projectId, records, sources]);

  if (!config) {
    return (
      <div className="project-theory">
        <section className="project-theory-hero"><div><h2>Гипотезы</h2></div></section>
      </div>
    );
  }

  const selected = records.find(record => record.id === selectedId) ?? records[0] ?? null;
  const nextId = () => records.reduce((max, record) => Math.max(max, record.id), 0) + 1;

  const addBlank = () => {
    const id = nextId();
    setRecords(current => [...current, createRecord(config, sources, id)]);
    setSelectedId(id);
  };

  const addFromChoice = () => {
    if (!candidates.length) return;
    let id = nextId();
    const additions = candidates.map(candidate => {
      const base = createRecord(config, sources, id);
      const record: RecordState = { id, values: { ...base.values, ...candidate.values } };
      id += 1;
      return record;
    });
    setRecords(current => [...current, ...additions]);
    setSelectedId(additions[0].id);
  };

  const applyRecord = (next: RecordState) => setRecords(current => current.map(record => (record.id === next.id ? next : record)));
  const removeRecord = (id: number) => {
    setRecords(current => current.filter(record => record.id !== id));
    setSelectedId(null);
  };

  // Назначение с карты: проставляем обе оси выбранной гипотезе (тот же путь сохранения).
  const assignMap = (id: number, importance: MapLevel, uncertainty: MapLevel) =>
    setRecords(current => current.map(record => (record.id === id
      ? { ...record, values: { ...record.values, importance, uncertainty } }
      : record)));

  // Клик по чипу на карте открывает гипотезу в реестре.
  const openFromMap = (id: number) => {
    setSelectedId(id);
    setView('list');
  };

  // Конвейер: перевод гипотезы на этап (ворота проверяются в компоненте конвейера).
  const advanceLifecycle = (id: number, stage: LifecycleStage) => {
    setBlocked(null);
    setRecords(current => current.map(record => (record.id === id
      ? { ...record, values: { ...record.values, lifecycle: stage } }
      : record)));
  };

  const switchView = (next: 'list' | 'map' | 'pipeline') => {
    setBlocked(null);
    setView(next);
  };

  // ИИ-генератор (Этап 5): просим бэкенд предложить гипотезы из контекста проекта.
  const suggest = async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const existing = records
        .map(record => record.values.statement?.trim() || record.values[NAME_KEY]?.trim() || '')
        .filter(Boolean);
      const { data } = await api.post(`/api/projects/${projectId}/hypotheses/suggest`, {
        context: buildSuggestContext(sources),
        existing,
      });
      const list = Array.isArray(data?.hypotheses) ? (data.hypotheses as HypothesisSuggestion[]) : [];
      setSuggestions(list);
      if (!list.length) setSuggestError('ИИ не вернул предложений — попробуйте позже или заполните больше контекста.');
    } catch {
      setSuggestError('Не удалось получить ответ ИИ. Попробуйте позже.');
    } finally {
      setSuggesting(false);
    }
  };

  const recordFromSuggestion = (suggestion: HypothesisSuggestion, id: number): RecordState => ({
    id,
    values: {
      ...createRecord(config, sources, id).values,
      [NAME_KEY]: suggestion.name,
      statement: suggestion.statement,
      source: suggestion.source,
      expectedEffect: suggestion.expectedEffect,
      lifecycle: 'черновик',
    },
  });

  const addSuggestion = (suggestion: HypothesisSuggestion) => {
    const id = nextId();
    setRecords(current => [...current, recordFromSuggestion(suggestion, id)]);
    setSuggestions(current => current.filter(item => item !== suggestion));
    setSelectedId(id);
  };

  const addAllSuggestions = () => {
    let id = nextId();
    const additions = suggestions.map(suggestion => {
      const record = recordFromSuggestion(suggestion, id);
      id += 1;
      return record;
    });
    if (!additions.length) return;
    setRecords(current => [...current, ...additions]);
    setSuggestions([]);
    setSelectedId(additions[0].id);
  };

  return (
    <div className="project-theory hyp-workbench">
      <section className="project-theory-hero hyp-workbench-head">
        <div>
          <h2>Гипотезы</h2>
          <p className="hyp-workbench-lead">{config.lead}</p>
        </div>
        <div className="hyp-workbench-actions">
          <div className="hyp-view-toggle" role="tablist">
            <button type="button" role="tab" className={view === 'list' ? 'is-active' : ''} onClick={() => switchView('list')}>Реестр</button>
            <button type="button" role="tab" className={view === 'map' ? 'is-active' : ''} onClick={() => switchView('map')}>Карта</button>
            <button type="button" role="tab" className={view === 'pipeline' ? 'is-active' : ''} onClick={() => switchView('pipeline')}>Конвейер</button>
          </div>
          <button className="btn btn-soft btn-sm" type="button" onClick={addFromChoice} disabled={!candidates.length}>
            <Icon name="sparkle" size={14} /> Из допущений выбора{candidates.length ? ` (${candidates.length})` : ''}
          </button>
          <button className="btn btn-soft btn-sm" type="button" onClick={suggest} disabled={suggesting}>
            <Icon name="sparkle" size={14} /> {suggesting ? 'ИИ думает…' : 'Предложить (ИИ)'}
          </button>
          <button className="btn btn-primary btn-sm" type="button" onClick={addBlank}>
            <Icon name="plus" size={14} /> Гипотеза
          </button>
        </div>
      </section>

      {suggestError && (
        <div className="hyp-gate-banner" role="alert">
          <span>{suggestError}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSuggestError(null)}>Понятно</button>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="hyp-suggest-panel">
          <div className="hyp-suggest-head">
            <strong>ИИ предлагает {suggestions.length} гипотез</strong>
            <div>
              <button className="btn btn-soft btn-sm" type="button" onClick={addAllSuggestions}>Добавить все</button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => setSuggestions([])}>Закрыть</button>
            </div>
          </div>
          <ul className="hyp-suggest-list">
            {suggestions.map((suggestion, index) => (
              <li className="hyp-suggest-item" key={`${suggestion.name}-${index}`}>
                <div>
                  <p className="hyp-suggest-statement">{suggestion.statement || suggestion.name}</p>
                  {suggestion.expectedEffect && <span className="hyp-suggest-meta">эффект: {suggestion.expectedEffect}</span>}
                </div>
                <button className="btn btn-soft btn-sm" type="button" onClick={() => addSuggestion(suggestion)}>
                  <Icon name="plus" size={14} /> Добавить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === 'map' ? (
        <ProjectAssumptionMap records={records} config={config} blindZones={blindZones} onAssign={assignMap} onSelect={openFromMap} />
      ) : view === 'pipeline' ? (
        <>
          {blocked && (
            <div className="hyp-gate-banner" role="alert">
              <span>
                «{blocked.label}» нельзя перевести в «{blocked.stageLabel}»: не заполнено — {blocked.missing.join(', ')}.
              </span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlocked(null)}>Понятно</button>
            </div>
          )}
          <ProjectHypothesisPipeline
            records={records}
            config={config}
            onAdvance={advanceLifecycle}
            onBlocked={setBlocked}
            onSelect={openFromMap}
          />
        </>
      ) : (
      <div className="hyp-workbench-body">
        <aside className="hyp-list">
          {records.length === 0 && <p className="hyp-list-empty">Пока нет гипотез. Добавьте первую или подтяните из допущений выбора.</p>}
          {records.map(record => {
            const quality = evaluateHypothesisQuality(record.values);
            return (
              <button
                key={record.id}
                type="button"
                className={`hyp-list-item${selected?.id === record.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(record.id)}
              >
                <span className={`hyp-dot ${quality.level}`} aria-hidden />
                <span className="hyp-list-item-label">{recordLabel(record, config)}</span>
              </button>
            );
          })}
        </aside>

        <section className="hyp-detail">
          {!selected ? (
            <div className="hyp-detail-empty">Выберите гипотезу слева или создайте новую.</div>
          ) : (
            <DraftCard
              key={selected.id}
              card={selected}
              title={recordLabel(selected, config)}
              onApply={applyRecord}
            >
              {(draft, patch) => {
                const setValue = (key: string, value: string) => patch({ values: { ...draft.values, [key]: value } });
                const quality = evaluateHypothesisQuality(draft.values);
                return (
                  <>
                    <div className={`hyp-quality ${quality.level}`}>
                      <span className={`hyp-dot ${quality.level}`} aria-hidden />
                      <strong>{QUALITY_LABEL[quality.level]}</strong>
                      {quality.missing.length > 0 && (
                        <ul className="hyp-quality-missing">
                          {quality.missing.map(item => <li key={item}>{item}</li>)}
                        </ul>
                      )}
                      <span className="hyp-stage-badge">Этап: {stageLabel(draft)}</span>
                    </div>

                    <label className="project-theory-field">
                      <span>Название гипотезы</span>
                      <input
                        className="form-input"
                        placeholder="Коротко, своими словами"
                        value={draft.values[NAME_KEY] || ''}
                        onChange={event => setValue(NAME_KEY, event.target.value)}
                      />
                    </label>

                    {FIELD_GROUPS.map(group => {
                      const fields = config.fields.filter(field => group.keys.includes(field.key));
                      if (!fields.length) return null;
                      return (
                        <div className="hyp-group" key={group.title}>
                          <h4 className="hyp-group-title">{group.title}</h4>
                          <div className="project-theory-grid two">
                            {fields.map(field => (
                              <TextField
                                key={field.key}
                                field={field}
                                value={draft.values[field.key] || ''}
                                onChange={value => setValue(field.key, value)}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    <div className="hyp-group">
                      <h4 className="hyp-group-title">Приоритет — для карты</h4>
                      <div className="project-theory-grid two">
                        {PRIORITY_FIELDS.map(field => (
                          <TextField
                            key={field.key}
                            field={field}
                            value={draft.values[field.key] || ''}
                            onChange={value => setValue(field.key, value)}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="hyp-detail-foot">
                      <button className="btn btn-ghost btn-sm" type="button" onClick={() => removeRecord(selected.id)}>
                        Удалить гипотезу
                      </button>
                    </div>
                  </>
                );
              }}
            </DraftCard>
          )}
        </section>
      </div>
      )}
    </div>
  );
}
