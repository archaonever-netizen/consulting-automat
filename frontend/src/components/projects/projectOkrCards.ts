// Адаптер «OKR / KPI» (okr-kpi) для ИИ-Методолога. OKR структурно самый вложенный:
// form = ObjectiveCard[], где у каждого objective свои подсписки keyResults[] и kpis[].
// Модель EditableCard плоская (карточка → списки → элементы), поэтому раскладываем вложенность
// в ТРИ списка верхнего уровня: objectives / keyResults / kpis. Элементы KR и KPI несут
// составной id «objId:childId» и поле-селектор родителя (objectiveRef), чтобы Методолог мог
// точечно править вложенные строки и добавлять их в нужный objective.
//
// Патч пишет ту же section-snapshot, что и канвас, и пересобирает проекцию через
// экспортированную из канваса buildOkrSnapshot — одна точка истины с живым редактированием.
import {
  buildOkrSnapshot,
  commonDataSources,
  createKeyResult,
  createKpi,
  createObjective,
  krStatusOptions,
  levelOptions,
  objectiveSourceOptions,
  periodOptions,
  type KeyResultRow,
  type KpiRow,
  type ObjectiveCard,
} from './ProjectOkrCanvas';
import { readProjectFrameworkSectionSnapshot, writeProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { pickIndex } from './projectEditShared';
import type { EditableCard, EditableFieldSchema, EditableItem, EditableList } from './projectEditModel';
import type { ApplyResult } from './projectEditApplier';
import type { Proposal } from './projectReview';

export const OKR_CARD_ID = 'okr-kpi';

export function isOkrCard(cardId: string): boolean {
  return cardId === OKR_CARD_ID;
}

interface OkrFieldSpec {
  key: string;
  label: string;
  options?: string[];
}

const OBJECTIVE_FIELDS: OkrFieldSpec[] = [
  { key: 'name', label: 'Название цели' },
  { key: 'source', label: 'Источник цели', options: objectiveSourceOptions },
  { key: 'objective', label: 'Формулировка цели' },
  { key: 'level', label: 'Уровень', options: levelOptions },
  { key: 'period', label: 'Период', options: periodOptions },
  { key: 'owner', label: 'Владелец' },
  { key: 'rhythm', label: 'CFR / управленческий ритм' },
];

const KR_FIELDS: OkrFieldSpec[] = [
  { key: 'name', label: 'Название KR' },
  { key: 'statement', label: 'Формулировка KR' },
  { key: 'metric', label: 'Метрика' },
  { key: 'baseline', label: 'Базовое значение' },
  { key: 'target', label: 'Целевое значение' },
  { key: 'unit', label: 'Единица измерения' },
  { key: 'controlSource', label: 'Источник контроля', options: commonDataSources },
  { key: 'frequency', label: 'Частота трекинга' },
  { key: 'progress', label: 'Текущий прогресс' },
  { key: 'status', label: 'Статус', options: krStatusOptions },
];

const KPI_FIELDS: OkrFieldSpec[] = [
  { key: 'name', label: 'Название KPI' },
  { key: 'indicator', label: 'Показатель' },
  { key: 'formula', label: 'Формула' },
  { key: 'target', label: 'Целевое значение' },
  { key: 'fact', label: 'Факт' },
  { key: 'tolerance', label: 'Допустимое отклонение' },
  { key: 'dataSource', label: 'Источник данных', options: commonDataSources },
  { key: 'frequency', label: 'Частота измерения' },
  { key: 'owner', label: 'Владелец' },
];

// Синтетическое поле-селектор родителя для KR/KPI (не хранится в строке — служит для add_item
// и как контекст: к какому objective относится элемент).
const PARENT_KEY = 'objectiveRef';
const PARENT_LABEL = 'К какой Цели относится';

type ChildKind = 'keyResults' | 'kpis';
type ChildRow = (KeyResultRow | KpiRow) & Record<string, unknown>;

// === Form ===

function readObjectives(projectId: number): ObjectiveCard[] {
  const form = readProjectFrameworkSectionSnapshot(projectId, OKR_CARD_ID)?.form as ObjectiveCard[] | undefined;
  const list = Array.isArray(form) && form.length ? form : [createObjective(1)];
  return list.map(o => ({
    ...o,
    keyResults: Array.isArray(o.keyResults) ? o.keyResults : [],
    kpis: Array.isArray(o.kpis) ? o.kpis : [],
  }));
}

function writeObjectives(projectId: number, objectives: ObjectiveCard[], message: string): ApplyResult {
  writeProjectFrameworkSectionSnapshot(projectId, OKR_CARD_ID, buildOkrSnapshot(projectId, objectives));
  return { ok: true, message };
}

const fail = (message: string): ApplyResult => ({ ok: false, message });

// === Метки / поля ===

const objectiveLabel = (o: ObjectiveCard) => o.name.trim() || o.objective.trim() || `Цель ${o.id}`;

function childLabel(kind: ChildKind, row: ChildRow): string {
  const name = String(row.name ?? '').trim();
  if (name) return name;
  if (kind === 'keyResults') return String((row as KeyResultRow).statement ?? '').trim() || `KR ${row.id}`;
  return String((row as KpiRow).indicator ?? '').trim() || `KPI ${row.id}`;
}

const childFields = (kind: ChildKind): OkrFieldSpec[] => (kind === 'keyResults' ? KR_FIELDS : KPI_FIELDS);
const childFactory = (kind: ChildKind, id: number): ChildRow =>
  (kind === 'keyResults' ? createKeyResult(id) : createKpi(id)) as ChildRow;

function nextId(rows: Array<{ id: number }>): number {
  return rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

function pickValues(row: Record<string, unknown>, fields: OkrFieldSpec[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = row[f.key];
    if (typeof v === 'string' && v.trim()) out[f.key] = v;
  }
  return out;
}

function toSchema(fields: OkrFieldSpec[]): EditableFieldSchema[] {
  return fields.map(f => ({ key: f.key, label: f.label, ...(f.options ? { options: f.options } : {}) }));
}

/** Применить присланные значения к строке по схеме полей. Возвращает число применённых полей.
 * Чужие ключи (в т.ч. objectiveRef) игнорируются. */
function applyScalarValues(target: Record<string, unknown>, fields: OkrFieldSpec[], values: Record<string, unknown> | undefined): number {
  if (!values) return 0;
  const byKey = new Map(fields.map(f => [f.key, f]));
  const byLabel = new Map(fields.map(f => [f.label.trim().toLowerCase(), f]));
  let touched = 0;
  for (const [k, v] of Object.entries(values)) {
    if (k === 'id') continue;
    const field = byKey.get(k) ?? byLabel.get(k.trim().toLowerCase());
    if (field) {
      target[field.key] = v == null ? '' : String(v);
      touched += 1;
    }
  }
  return touched;
}

// === Карта карточки для модели ===

export function buildOkrEditable(projectId: number): EditableCard {
  const objectives = readObjectives(projectId);
  const objectiveOptions = objectives.map(objectiveLabel);
  const parentField: EditableFieldSchema = {
    key: PARENT_KEY,
    label: PARENT_LABEL,
    ...(objectiveOptions.length ? { options: objectiveOptions } : {}),
  };

  const objectiveItems: EditableItem[] = objectives.map(o => ({
    id: String(o.id),
    label: objectiveLabel(o),
    values: pickValues(o as unknown as Record<string, unknown>, OBJECTIVE_FIELDS),
  }));

  const childItems = (kind: ChildKind): EditableItem[] =>
    objectives.flatMap(o => (o[kind] as ChildRow[]).map(row => ({
      id: `${o.id}:${row.id}`,
      label: childLabel(kind, row),
      values: { ...pickValues(row, childFields(kind)), [PARENT_KEY]: objectiveLabel(o) },
    })));

  const lists: EditableList[] = [
    { list: 'objectives', title: 'Цель', item_fields: toSchema(OBJECTIVE_FIELDS), items: objectiveItems },
    { list: 'keyResults', title: 'Ключевой результат', item_fields: [parentField, ...toSchema(KR_FIELDS)], items: childItems('keyResults') },
    { list: 'kpis', title: 'KPI', item_fields: [parentField, ...toSchema(KPI_FIELDS)], items: childItems('kpis') },
  ];

  return { card_id: OKR_CARD_ID, title: 'OKR / KPI', lists };
}

// === Применение правок ===

function normalizeList(name: string | undefined): '' | 'objectives' | 'keyResults' | 'kpis' {
  const lc = (name ?? '').trim().toLowerCase();
  if (!lc) return '';
  if (['objectives', 'objective', 'цели', 'цель', 'objective (повторяемая карточка)'].includes(lc)) return 'objectives';
  if (['keyresults', 'key results', 'key result', 'kr', 'keyresult', 'ключевые результаты', 'ключевой результат'].includes(lc)) return 'keyResults';
  if (['kpis', 'kpi', 'показатели'].includes(lc)) return 'kpis';
  return '';
}

function parseComposite(itemId: unknown): { objRef: string; childRef: string } {
  const s = String(itemId ?? '').trim();
  const idx = s.indexOf(':');
  if (idx === -1) return { objRef: '', childRef: s };
  return { objRef: s.slice(0, idx).trim(), childRef: s.slice(idx + 1).trim() };
}

function findObjectiveIndex(objectives: ObjectiveCard[], ref: unknown): number {
  return pickIndex(objectives, ref, o => String(o.id), o => objectiveLabel(o));
}

// Строгое совпадение по id/метке (без fallback на единственную строку) — для широкого поиска
// дочернего элемента сразу во всех objective, чтобы не привязать к чужому родителю.
function strictChildIndex(kind: ChildKind, rows: ChildRow[], ref: unknown): number {
  const raw = String(ref ?? '').trim();
  if (!raw) return -1;
  let idx = rows.findIndex(r => String(r.id) === raw);
  if (idx !== -1) return idx;
  const lc = raw.toLowerCase();
  idx = rows.findIndex(r => childLabel(kind, r).trim().toLowerCase() === lc);
  if (idx !== -1) return idx;
  if (lc.length >= 3) idx = rows.findIndex(r => childLabel(kind, r).toLowerCase().includes(lc));
  return idx;
}

function resolveParentForAdd(objectives: ObjectiveCard[], objRef: string, values: Record<string, unknown> | undefined): number {
  if (objRef) {
    const i = findObjectiveIndex(objectives, objRef);
    if (i !== -1) return i;
  }
  const parentRef = values?.[PARENT_KEY];
  if (parentRef != null && String(parentRef).trim()) {
    const i = findObjectiveIndex(objectives, parentRef);
    if (i !== -1) return i;
  }
  return objectives.length === 1 ? 0 : -1;
}

function locateChild(
  objectives: ObjectiveCard[],
  kind: ChildKind,
  objRef: string,
  childRef: string,
  parentRef: unknown,
): { rows: ChildRow[]; index: number; row: ChildRow } | null {
  const inObjective = (oi: number): { rows: ChildRow[]; index: number; row: ChildRow } | null => {
    const rows = objectives[oi][kind] as ChildRow[];
    const idx = pickIndex(rows, childRef, r => String(r.id), r => childLabel(kind, r));
    return idx === -1 ? null : { rows, index: idx, row: rows[idx] };
  };

  if (objRef) {
    const oi = findObjectiveIndex(objectives, objRef);
    if (oi !== -1) { const hit = inObjective(oi); if (hit) return hit; }
  }
  if (parentRef != null && String(parentRef).trim()) {
    const oi = findObjectiveIndex(objectives, parentRef);
    if (oi !== -1) { const hit = inObjective(oi); if (hit) return hit; }
  }
  for (const obj of objectives) {
    const rows = obj[kind] as ChildRow[];
    const idx = strictChildIndex(kind, rows, childRef);
    if (idx !== -1) return { rows, index: idx, row: rows[idx] };
  }
  if (objectives.length === 1 && (objectives[0][kind] as ChildRow[]).length === 1) {
    const rows = objectives[0][kind] as ChildRow[];
    return { rows, index: 0, row: rows[0] };
  }
  return null;
}

function applyObjectiveOp(projectId: number, objectives: ObjectiveCard[], proposal: Proposal): ApplyResult {
  if (proposal.op === 'add_item') {
    const objective = createObjective(nextId(objectives));
    applyScalarValues(objective as unknown as Record<string, unknown>, OBJECTIVE_FIELDS, proposal.values);
    objectives.push(objective);
    return writeObjectives(projectId, objectives, 'Добавлена цель.');
  }
  if (proposal.op === 'update_item' || proposal.op === 'update_field') {
    const idx = findObjectiveIndex(objectives, proposal.item_id);
    if (idx === -1) return fail('Не найдена цель для изменения.');
    const values = proposal.values ?? (proposal.field ? { [proposal.field]: proposal.value } : undefined);
    if (!applyScalarValues(objectives[idx] as unknown as Record<string, unknown>, OBJECTIVE_FIELDS, values)) {
      return fail('Нечего изменять: не распознаны поля цели.');
    }
    return writeObjectives(projectId, objectives, 'Цель обновлена.');
  }
  if (proposal.op === 'delete_item') {
    const idx = findObjectiveIndex(objectives, proposal.item_id);
    if (idx === -1) return fail('Не найдена цель для удаления.');
    objectives.splice(idx, 1);
    return writeObjectives(projectId, objectives, 'Цель удалена.');
  }
  return fail('Неизвестная операция.');
}

function applyChildOp(projectId: number, objectives: ObjectiveCard[], proposal: Proposal, kind: ChildKind): ApplyResult {
  const fields = childFields(kind);
  const { objRef, childRef } = parseComposite(proposal.item_id);
  const title = kind === 'keyResults' ? 'Ключевой результат' : 'KPI';

  if (proposal.op === 'add_item') {
    const oi = resolveParentForAdd(objectives, objRef, proposal.values);
    if (oi === -1) return fail(`Укажите, к какой Цели относится новый ${title} (поле «${PARENT_LABEL}»).`);
    const rows = objectives[oi][kind] as ChildRow[];
    const row = childFactory(kind, nextId(rows));
    applyScalarValues(row, fields, proposal.values);
    rows.push(row);
    return writeObjectives(projectId, objectives, `Добавлен ${title}.`);
  }
  if (proposal.op === 'update_item') {
    const hit = locateChild(objectives, kind, objRef, childRef, proposal.values?.[PARENT_KEY]);
    if (!hit) return fail(`Не найден ${title} для изменения.`);
    const values = proposal.values ?? (proposal.field ? { [proposal.field]: proposal.value } : undefined);
    if (!applyScalarValues(hit.row, fields, values)) return fail('Нечего изменять: не распознаны поля.');
    return writeObjectives(projectId, objectives, `${title} обновлён.`);
  }
  if (proposal.op === 'delete_item') {
    const hit = locateChild(objectives, kind, objRef, childRef, proposal.values?.[PARENT_KEY]);
    if (!hit) return fail(`Не найден ${title} для удаления.`);
    hit.rows.splice(hit.index, 1);
    return writeObjectives(projectId, objectives, `${title} удалён.`);
  }
  return fail('Неизвестная операция.');
}

function inferList(objectives: ObjectiveCard[], proposal: Proposal): '' | 'objectives' | 'keyResults' | 'kpis' {
  const keys = Object.keys(proposal.values || {});
  if (keys.length) {
    const score = (fields: OkrFieldSpec[]) => keys.filter(k => fields.some(f => f.key === k)).length;
    const ranked = ([['objectives', score(OBJECTIVE_FIELDS)], ['keyResults', score(KR_FIELDS)], ['kpis', score(KPI_FIELDS)]] as const)
      .slice()
      .sort((a, b) => b[1] - a[1]);
    if (ranked[0][1] > 0) return ranked[0][0];
  }
  if (proposal.item_id != null) {
    const { childRef } = parseComposite(proposal.item_id);
    if (objectives.some(o => strictChildIndex('keyResults', o.keyResults as ChildRow[], childRef) !== -1)) return 'keyResults';
    if (objectives.some(o => strictChildIndex('kpis', o.kpis as ChildRow[], childRef) !== -1)) return 'kpis';
    if (objectives.some(o => String(o.id) === String(proposal.item_id).trim())) return 'objectives';
  }
  return '';
}

/** Применить одно подтверждённое предложение к «OKR / KPI». */
export function applyOkrEdit(projectId: number, proposal: Proposal): ApplyResult {
  const objectives = JSON.parse(JSON.stringify(readObjectives(projectId))) as ObjectiveCard[];

  let list = normalizeList(proposal.list);
  if (!list && proposal.op === 'update_field') return applyObjectiveOp(projectId, objectives, proposal);
  if (!list) list = inferList(objectives, proposal);

  if (list === 'objectives') return applyObjectiveOp(projectId, objectives, proposal);
  if (list === 'keyResults') return applyChildOp(projectId, objectives, proposal, 'keyResults');
  if (list === 'kpis') return applyChildOp(projectId, objectives, proposal, 'kpis');
  return fail('Не понял, что менять в OKR — укажите list: objectives | keyResults | kpis.');
}
