import { useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import Icon from '../Icon';
import api from '../../services/api';
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
import {
  CHECK_STAGES,
  VERDICTS,
  canConcludeVerdict,
  checkStatusLevel,
  gateFor,
  stageOf,
  suggestVerdict,
  verdictGate,
  verdictOf,
  type CheckStage,
} from './projectCheckStage';
import ProjectChecksBoard, { type BlockedMove } from './ProjectChecksBoard';
import { pushVerdictToHypotheses } from './projectCheckLoopback';
import {
  EVIDENCE_KINDS,
  EVIDENCE_STANCES,
  createEvidence,
  evidenceOf,
  serializeEvidence,
  summarizeEvidence,
  type Evidence,
  type EvidenceKind,
  type EvidenceStance,
} from './projectCheckEvidence';

// Инструмент «Проверки» (Этап B, CHECKS_WORKBENCH.md). Исполнение проверки гипотезы:
// степпер этапов (Дизайн → Сбор → Оценка → Вердикт → Следствие), таблица свидетельств и
// ОБЪЕКТИВНЫЙ вердикт за воротами. Включается тем же флагом hypotheses_workbench; пишет/читает
// ТОТ ЖЕ снапшот секции `experiments`, что и старый ProjectFrameworkSectionCanvas — данные
// общие, переключение безопасно. Логика этапов/свидетельств — в чистых модулях projectCheck*.
const SCREEN_ID = 'experiments';

// Поля дизайна проверки (подмножество config.fields секции `experiments`), сгруппированные по
// смыслу. Вердикт/факт/следствие рендерятся отдельными секциями ниже, не как сырые поля.
const DESIGN_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'Что и как проверяем', keys: ['hypothesis', 'subject', 'method', 'metric', 'dataSource', 'period', 'owner', 'resource'] },
  { title: 'Критерий — задаётся заранее', keys: ['baseline', 'confirmThreshold', 'refuteThreshold', 'constraints'] },
];

function recordLabel(record: RecordState, config: ScreenConfig): string {
  return record.values[NAME_KEY]?.trim() || record.values[config.primaryField]?.trim() || 'Без названия';
}

// Метаданные файла, возвращаемые бэкендом после загрузки в Supabase Storage.
interface UploadedEvidenceFile {
  storagePath: string;
  filename: string;
  mime: string;
  size: number;
}

function apiError(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    if (error.response?.status === 503) return 'Хранилище файлов (Supabase Storage) не настроено на сервере.';
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && (detail[0] as { msg?: string })?.msg) return String((detail[0] as { msg?: string }).msg);
  }
  return fallback;
}

function humanSize(bytes: number | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// Деталь одной проверки: правит запись напрямую (autosave в родителе дебаунсит запись).
function CheckDetail({
  projectId,
  record,
  config,
  hypPrimaryField,
  onPatch,
  onRemove,
}: {
  projectId: number;
  record: RecordState;
  config: ScreenConfig;
  hypPrimaryField: string;
  onPatch: (values: Record<string, string>) => void;
  onRemove: () => void;
}) {
  const [blocked, setBlocked] = useState<{ stageLabel: string; missing: string[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [loopNote, setLoopNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const values = record.values;
  const setValue = (key: string, value: string) => onPatch({ ...values, [key]: value });

  const evidence = evidenceOf(values);
  const setEvidence = (items: Evidence[]) => setValue('evidence', serializeEvidence(items));
  const addEvidence = (kind: EvidenceKind) => setEvidence([...evidence, createEvidence({ kind })]);
  const patchEvidence = (id: string, patch: Partial<Evidence>) =>
    setEvidence(evidence.map(item => (item.id === id ? { ...item, ...patch } : item)));
  const removeEvidence = (id: string) => setEvidence(evidence.filter(item => item.id !== id));
  const summary = summarizeEvidence(evidence);

  const evidenceUrl = `/api/projects/${projectId}/checks/${record.id}/evidence`;

  // Загрузка файла-свидетельства в Storage; метаданные пишем в поле `evidence`.
  const uploadFile = async (file: File) => {
    setFileError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await api.post<UploadedEvidenceFile>(evidenceUrl, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setEvidence([...evidence, createEvidence({
        kind: 'file',
        title: data.filename,
        storagePath: data.storagePath,
        mime: data.mime,
        size: data.size,
      })]);
    } catch (error) {
      setFileError(apiError(error, 'Не удалось загрузить файл'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // Скачивание файла из приватного бакета (бинарник за авторизацией → blob).
  const downloadFile = async (item: Evidence) => {
    if (!item.storagePath) return;
    setFileError(null);
    try {
      const { data } = await api.get(evidenceUrl, { params: { path: item.storagePath }, responseType: 'blob' });
      const href = URL.createObjectURL(new Blob([data], { type: item.mime || 'application/octet-stream' }));
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = item.title || item.storagePath.split('/').pop() || 'file';
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (error) {
      setFileError(apiError(error, 'Не удалось скачать файл'));
    }
  };

  // Удаление свидетельства: для файла сначала best-effort убираем объект из Storage.
  const dropEvidence = async (item: Evidence) => {
    if (item.kind === 'file' && item.storagePath) {
      try {
        await api.delete(evidenceUrl, { params: { path: item.storagePath } });
      } catch {
        /* объект мог уже исчезнуть — метаданные всё равно убираем */
      }
    }
    removeEvidence(item.id);
  };

  const stage = stageOf(record);
  const stageIndex = CHECK_STAGES.findIndex(item => item.key === stage);
  const goStage = (target: CheckStage, label: string) => {
    const gate = gateFor(target, values);
    if (gate.ok) {
      setValue('stage', target);
      setBlocked(null);
    } else {
      setBlocked({ stageLabel: label, missing: gate.missing });
    }
  };

  const canVerdict = canConcludeVerdict(values);
  const vGate = verdictGate(values);
  const verdict = verdictOf(record);
  const suggestion = suggestVerdict(values);
  const level = checkStatusLevel(record);

  // Фиксация вердикта: для подтверждена/опровергнута замыкаем петлю — связанная гипотеза
  // переходит в «Результат» (см. projectCheckLoopback).
  const chooseVerdict = (option: typeof VERDICTS[number]) => {
    setValue('result', option);
    if (option === 'подтверждена' || option === 'опровергнута') {
      const moved = pushVerdictToHypotheses(projectId, values.hypothesis || '', hypPrimaryField);
      setLoopNote(moved ? 'Связанная гипотеза переведена в «Результат».' : null);
    } else {
      setLoopNote(null);
    }
  };

  const fieldByKey = (key: string) => config.fields.find(field => field.key === key);
  const fieldsFor = (keys: string[]) => keys.map(fieldByKey).filter(Boolean) as FieldDef[];

  return (
    <div className="project-theory-card">
      <div className={`hyp-quality ${level}`}>
        <span className={`hyp-dot ${level}`} aria-hidden />
        <strong>{verdict ?? 'идёт проверка'}</strong>
        <span className="hyp-stage-badge">Этап: {CHECK_STAGES[stageIndex]?.label ?? 'Дизайн'}</span>
      </div>

      <label className="project-theory-field">
        <span>Название проверки</span>
        <input
          className="form-input"
          placeholder="Коротко, своими словами"
          value={values[NAME_KEY] || ''}
          onChange={event => setValue(NAME_KEY, event.target.value)}
        />
      </label>

      <div className="chk-criterion">
        <span className="chk-criterion-item"><b>✅ Подтверждение:</b> {values.confirmThreshold?.trim() || '— порог не задан'}</span>
        <span className="chk-criterion-item"><b>❌ Опровержение:</b> {values.refuteThreshold?.trim() || '— порог не задан'}</span>
      </div>

      <div className="chk-stepper" role="list">
        {CHECK_STAGES.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="listitem"
            className={`chk-step${item.key === stage ? ' is-current' : ''}${index <= stageIndex ? ' is-reached' : ''}`}
            onClick={() => goStage(item.key, item.label)}
            title="Перейти на этап (если ворота открыты)"
          >
            <span className="chk-step-dot">{index + 1}</span>
            <span className="chk-step-label">{item.label}</span>
          </button>
        ))}
      </div>

      {blocked && (
        <div className="hyp-gate-banner" role="alert">
          <span>Нельзя перейти в «{blocked.stageLabel}»: не хватает — {blocked.missing.join(', ')}.</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlocked(null)}>Понятно</button>
        </div>
      )}

      <div className="hyp-group">
        <h4 className="hyp-group-title">Дизайн проверки</h4>
        <div className="project-theory-grid two">
          {fieldsFor(DESIGN_GROUPS[0].keys).map(field => (
            <TextField key={field.key} field={field} value={values[field.key] || ''} onChange={value => setValue(field.key, value)} />
          ))}
        </div>
        <div className="project-theory-grid two">
          {fieldsFor(DESIGN_GROUPS[1].keys).map(field => (
            <TextField key={field.key} field={field} value={values[field.key] || ''} onChange={value => setValue(field.key, value)} />
          ))}
        </div>
      </div>

      <div className="hyp-group">
        <div className="chk-evidence-head">
          <h4 className="hyp-group-title">Свидетельства</h4>
          <div className="chk-evidence-add">
            <button className="btn btn-soft btn-sm" type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Icon name="plus" size={13} /> {uploading ? 'Загрузка…' : 'Файл'}
            </button>
            <button className="btn btn-soft btn-sm" type="button" onClick={() => addEvidence('link')}><Icon name="plus" size={13} /> Ссылка</button>
            <button className="btn btn-soft btn-sm" type="button" onClick={() => addEvidence('data')}><Icon name="plus" size={13} /> Данные</button>
            <button className="btn btn-soft btn-sm" type="button" onClick={() => addEvidence('note')}><Icon name="plus" size={13} /> Заметка</button>
            <input
              ref={fileRef}
              type="file"
              style={{ display: 'none' }}
              onChange={event => { const file = event.target.files?.[0]; if (file) uploadFile(file); }}
            />
          </div>
        </div>
        {fileError && (
          <div className="hyp-gate-banner" role="alert">
            <span>{fileError}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFileError(null)}>Понятно</button>
          </div>
        )}
        {evidence.length === 0 ? (
          <p className="chk-evidence-empty">Пока нет свидетельств. Добавьте ссылку, данные или заметку и отметьте «за / против».</p>
        ) : (
          <ul className="chk-evidence-list">
            {evidence.map(item => (
              <li className={`chk-evidence-item stance-${item.stance}`} key={item.id}>
                <div className="chk-evidence-row">
                  <span className="chk-evidence-kind">{EVIDENCE_KINDS.find(kind => kind.key === item.kind)?.label}</span>
                  <input
                    className="form-input"
                    placeholder="Что это за свидетельство"
                    value={item.title}
                    onChange={event => patchEvidence(item.id, { title: event.target.value })}
                  />
                  <select
                    className="form-select chk-evidence-stance"
                    value={item.stance}
                    onChange={event => patchEvidence(item.id, { stance: event.target.value as EvidenceStance })}
                  >
                    {EVIDENCE_STANCES.map(stance => <option key={stance.key} value={stance.key}>{stance.label}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" type="button" onClick={() => dropEvidence(item)} aria-label="Удалить свидетельство">
                    <Icon name="trash" size={14} />
                  </button>
                </div>
                <div className="chk-evidence-row">
                  {item.kind === 'link' && (
                    <input
                      className="form-input"
                      placeholder="URL (Google Drive / Я.Диск / ссылка)"
                      value={item.url || ''}
                      onChange={event => patchEvidence(item.id, { url: event.target.value })}
                    />
                  )}
                  {item.kind === 'file' && (
                    <span className="chk-evidence-file">
                      <Icon name="paperclip" size={13} /> {item.title || 'файл'}{item.size ? ` · ${humanSize(item.size)}` : ''}
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => downloadFile(item)}>Скачать</button>
                    </span>
                  )}
                  <input
                    className="form-input chk-evidence-measure"
                    placeholder="Измерено — для сверки с порогом"
                    value={item.measuredValue}
                    onChange={event => patchEvidence(item.id, { measuredValue: event.target.value })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {evidence.length > 0 && (
          <p className="chk-evidence-summary">
            За: {summary.for} · Против: {summary.against} · Нейтрально: {summary.neutral} · С измерением: {summary.measured}
          </p>
        )}
        <p className="chk-hint">Файлы хранятся в приватном бакете (Supabase Storage); ссылки, данные и заметки — здесь же.</p>
      </div>

      <div className="hyp-group">
        <h4 className="hyp-group-title">Вердикт</h4>
        {!canVerdict && (
          <div className="chk-verdict-locked">
            🔒 Объективный вердикт пока недоступен — не хватает: {vGate.missing.join(', ')}. Доступно только «недостаточно данных».
          </div>
        )}
        {canVerdict && verdict !== suggestion && (
          <p className="chk-hint">Свидетельства склоняются к: <b>{suggestion}</b>.</p>
        )}
        <div className="chk-verdict-options">
          {VERDICTS.map(option => {
            const disabled = (option === 'подтверждена' || option === 'опровергнута') && !canVerdict;
            return (
              <label key={option} className={`chk-verdict-option${verdict === option ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}>
                <input
                  type="radio"
                  name={`verdict-${record.id}`}
                  value={option}
                  checked={verdict === option}
                  disabled={disabled}
                  onChange={() => chooseVerdict(option)}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
        {loopNote && <p className="chk-hint chk-loop-note">↳ {loopNote}</p>}
      </div>

      <div className="hyp-group">
        <h4 className="hyp-group-title">Следствие</h4>
        <div className="project-theory-grid two">
          {fieldsFor(['fact', 'nextAction']).map(field => (
            <TextField key={field.key} field={field} value={values[field.key] || ''} onChange={value => setValue(field.key, value)} />
          ))}
        </div>
      </div>

      <div className="hyp-detail-foot">
        <button className="btn btn-ghost btn-sm" type="button" onClick={onRemove}>Удалить проверку</button>
      </div>
    </div>
  );
}

export default function ProjectChecksWorkbench({ projectId }: { projectId: number }) {
  const sources = useMemo(() => readProjectSources(projectId), [projectId]);
  const configs = useMemo(() => createConfigs(sources), [sources]);
  const config = configs.experiments;
  const hypPrimaryField = configs.hypotheses?.primaryField ?? 'statement';

  const [records, setRecords] = useState<RecordState[]>(() => {
    const savedForm = readProjectFrameworkSectionSnapshot(projectId, SCREEN_ID)?.form as RecordState[] | undefined;
    if (savedForm?.length) return savedForm;
    return config ? [createRecord(config, sources, 1)] : [];
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<'card' | 'board'>('card');
  const [blocked, setBlocked] = useState<BlockedMove | null>(null);

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
        <section className="project-theory-hero"><div><h2>Проверки</h2></div></section>
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

  const patchValues = (id: number, values: Record<string, string>) =>
    setRecords(current => current.map(record => (record.id === id ? { ...record, values } : record)));

  const removeRecord = (id: number) => {
    setRecords(current => current.filter(record => record.id !== id));
    setSelectedId(null);
  };

  // Перевод проверки на этап с доски (ворота проверяются в самой доске).
  const advanceStage = (id: number, stage: CheckStage) => {
    setBlocked(null);
    setRecords(current => current.map(record => (record.id === id
      ? { ...record, values: { ...record.values, stage } }
      : record)));
  };

  // Клик по карточке на доске открывает её в виде «Карточка».
  const openFromBoard = (id: number) => {
    setSelectedId(id);
    setBlocked(null);
    setView('card');
  };

  const switchView = (next: 'card' | 'board') => {
    setBlocked(null);
    setView(next);
  };

  return (
    <div className="project-theory hyp-workbench">
      <section className="project-theory-hero hyp-workbench-head">
        <div>
          <h2>Проверки</h2>
          <p className="hyp-workbench-lead">{config.lead}</p>
        </div>
        <div className="hyp-workbench-actions">
          <div className="hyp-view-toggle" role="tablist">
            <button type="button" role="tab" className={view === 'card' ? 'is-active' : ''} onClick={() => switchView('card')}>Карточка</button>
            <button type="button" role="tab" className={view === 'board' ? 'is-active' : ''} onClick={() => switchView('board')}>Доска</button>
          </div>
          <button className="btn btn-primary btn-sm" type="button" onClick={addBlank}>
            <Icon name="plus" size={14} /> Проверка
          </button>
        </div>
      </section>

      {view === 'board' ? (
        <>
          {blocked && (
            <div className="hyp-gate-banner" role="alert">
              <span>«{blocked.label}» нельзя перевести в «{blocked.stageLabel}»: не хватает — {blocked.missing.join(', ')}.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setBlocked(null)}>Понятно</button>
            </div>
          )}
          <ProjectChecksBoard
            records={records}
            config={config}
            onAdvance={advanceStage}
            onBlocked={setBlocked}
            onSelect={openFromBoard}
          />
        </>
      ) : (
      <div className="hyp-workbench-body">
        <aside className="hyp-list">
          {records.length === 0 && <p className="hyp-list-empty">Пока нет проверок. Добавьте первую — она ведёт одну гипотезу к объективному вердикту.</p>}
          {records.map(record => (
            <button
              key={record.id}
              type="button"
              className={`hyp-list-item${selected?.id === record.id ? ' is-active' : ''}`}
              onClick={() => setSelectedId(record.id)}
            >
              <span className={`hyp-dot ${checkStatusLevel(record)}`} aria-hidden />
              <span className="hyp-list-item-label">{recordLabel(record, config)}</span>
            </button>
          ))}
        </aside>

        <section className="hyp-detail">
          {!selected ? (
            <div className="hyp-detail-empty">Выберите проверку слева или создайте новую.</div>
          ) : (
            <CheckDetail
              key={selected.id}
              projectId={projectId}
              record={selected}
              config={config}
              hypPrimaryField={hypPrimaryField}
              onPatch={values => patchValues(selected.id, values)}
              onRemove={() => removeRecord(selected.id)}
            />
          )}
        </section>
      </div>
      )}
    </div>
  );
}
