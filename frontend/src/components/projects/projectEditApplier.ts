// Применение подтверждённых правок ИИ-Методолога к карточкам проекта.
// • Секционные карточки («повторяющиеся окна») — точная пересборка снапшота (buildSectionSnapshot).
// • Сложные карточки (Диагноз/Стратвыбор/Целевое состояние) — «хирургический патч» form + проекции
//   через реестр projectComplexCards. Theory/OKR в v1 не правятся (мягкий отказ).
// Применяется ТОЛЬКО после явного подтверждения пользователем (это делает панель).
import {
  GENERIC_SECTION_IDS,
  NAME_KEY,
  buildSectionSnapshot,
  createConfigs,
  createRecord,
  readProjectSources,
  type RecordState,
  type ScreenConfig,
} from './ProjectFrameworkSectionCanvas';
import {
  readProjectFrameworkSectionSnapshot,
  writeProjectFrameworkSectionSnapshot,
} from './projectFrameworkSectionSnapshot';
import {
  COMPLEX_CARDS,
  deriveProjItem,
  isComplexCard,
  type ComplexCardSpec,
  type ComplexListSpec,
  type FormItem,
  type Snapshot,
} from './projectComplexCards';
import type { Proposal } from './projectReview';

export interface ApplyResult {
  ok: boolean;
  message: string;
}

const fail = (message: string): ApplyResult => ({ ok: false, message });
const ok = (message: string): ApplyResult => ({ ok: true, message });

// ===== Секционные карточки =====

function normalizeValues(config: ScreenConfig, raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const byLabel = new Map<string, string>([
    ['название карточки', NAME_KEY],
    ['название', NAME_KEY],
    ['name', NAME_KEY],
  ]);
  for (const f of config.fields) byLabel.set(f.label.trim().toLowerCase(), f.key);
  const knownKeys = new Set<string>([NAME_KEY, ...config.fields.map(f => f.key)]);

  for (const [rawKey, rawVal] of Object.entries(raw)) {
    const value = rawVal == null ? '' : String(rawVal);
    if (knownKeys.has(rawKey)) {
      out[rawKey] = value;
      continue;
    }
    const mapped = byLabel.get(rawKey.trim().toLowerCase());
    if (mapped) out[mapped] = value;
  }
  return out;
}

function loadRecords(projectId: number, cardId: string): RecordState[] {
  const form = readProjectFrameworkSectionSnapshot(projectId, cardId)?.form as RecordState[] | undefined;
  return Array.isArray(form) ? form.map(r => ({ id: r.id, values: { ...r.values } })) : [];
}

function applySectionEdit(projectId: number, proposal: Proposal): ApplyResult {
  const { card_id: cardId, op } = proposal;
  const sources = readProjectSources(projectId);
  const config = createConfigs(sources)[cardId];
  if (!config) return fail('Не найдена конфигурация раздела.');
  const records = loadRecords(projectId, cardId);
  const nextId = records.reduce((m, r) => Math.max(m, r.id), 0) + 1;

  if (op === 'add_item') {
    const record = createRecord(config, sources, nextId);
    Object.assign(record.values, normalizeValues(config, proposal.values));
    records.push(record);
  } else if (op === 'update_item' || op === 'update_field') {
    const id = Number(proposal.item_id);
    const idx = records.findIndex(r => r.id === id);
    if (Number.isNaN(id) || idx === -1) return fail('Не найден элемент для изменения.');
    const values = op === 'update_field' && proposal.field
      ? normalizeValues(config, { [proposal.field]: proposal.value })
      : normalizeValues(config, proposal.values);
    if (Object.keys(values).length === 0) return fail('Нечего изменять: не указаны поля.');
    records[idx] = { ...records[idx], values: { ...records[idx].values, ...values } };
  } else if (op === 'delete_item') {
    const id = Number(proposal.item_id);
    const idx = records.findIndex(r => r.id === id);
    if (Number.isNaN(id) || idx === -1) return fail('Не найден элемент для удаления.');
    records.splice(idx, 1);
  } else {
    return fail('Неизвестная операция.');
  }

  writeProjectFrameworkSectionSnapshot(projectId, cardId, buildSectionSnapshot(projectId, config, sources, records));
  return ok(op === 'add_item' ? 'Добавлено новое окно.' : op === 'delete_item' ? 'Окно удалено.' : 'Формулировка обновлена.');
}

// ===== Сложные карточки =====

function nextItemId(arr: FormItem[]): number {
  return arr.reduce((m, i) => Math.max(m, Number(i.id) || 0), 0) + 1;
}

function mergeItemValues(item: FormItem, values: Record<string, unknown> | undefined) {
  if (!values) return;
  for (const [k, v] of Object.entries(values)) {
    if (k === 'id') continue;
    if (k in item) {
      item[k] = Array.isArray(item[k])
        ? String(v).split(/[;,]\s*/).map(s => s.trim()).filter(Boolean)
        : v == null ? '' : String(v);
    } else {
      const lk = k.trim().toLowerCase();
      if ((lk === 'name' || lk === 'название' || lk === 'название карточки') && 'name' in item) {
        item.name = v == null ? '' : String(v);
      }
    }
  }
}

function findList(spec: ComplexCardSpec, name: string | undefined): ComplexListSpec | undefined {
  if (name) {
    const byKey = spec.lists.find(l => l.projKey === name || l.formKey === name);
    if (byKey) return byKey;
    const byTitle = spec.lists.find(l => l.title.toLowerCase() === name.trim().toLowerCase());
    if (byTitle) return byTitle;
  }
  return spec.lists.length === 1 ? spec.lists[0] : undefined;
}

function applyComplexEdit(projectId: number, spec: ComplexCardSpec, proposal: Proposal): ApplyResult {
  const base = (spec.read(projectId) ?? spec.fallback(projectId)) as Snapshot;
  const form = (base.form && typeof base.form === 'object' ? { ...(base.form as Record<string, unknown>) } : {}) as Record<string, unknown>;

  if (proposal.op === 'update_field') {
    const field = proposal.field;
    if (!field) return fail('Не указано поле для изменения.');
    const fieldSpec = spec.scalarFields.find(f => f.key === field || f.label.toLowerCase() === field.toLowerCase());
    const key = fieldSpec?.key ?? field;
    const container = { ...spec.createScalar(), ...((form[spec.scalarContainer] as Record<string, unknown>) || {}) };
    container[key] = proposal.value == null ? '' : String(proposal.value);
    form[spec.scalarContainer] = container;
    base.form = form;
    const projKey = fieldSpec?.projKey ?? key;
    if (projKey in base) base[projKey] = container[key];
    spec.write(projectId, base);
    return ok('Формулировка обновлена.');
  }

  const listSpec = findList(spec, proposal.list);
  if (!listSpec) return fail('Не указан или не найден список для изменения.');
  const arr = (Array.isArray(form[listSpec.formKey]) ? [...(form[listSpec.formKey] as FormItem[])] : []) as FormItem[];

  if (proposal.op === 'add_item') {
    if (!listSpec.createItem) return fail(`В список «${listSpec.title}» нельзя добавлять элементы автоматически.`);
    const item = listSpec.createItem(nextItemId(arr));
    mergeItemValues(item, proposal.values);
    arr.push(item);
  } else if (proposal.op === 'update_item') {
    const id = Number(proposal.item_id);
    const idx = arr.findIndex(i => Number(i.id) === id);
    if (Number.isNaN(id) || idx === -1) return fail('Не найден элемент для изменения.');
    const item = { ...arr[idx] };
    mergeItemValues(item, proposal.values ?? (proposal.field ? { [proposal.field]: proposal.value } : undefined));
    arr[idx] = item;
  } else if (proposal.op === 'delete_item') {
    const id = Number(proposal.item_id);
    const idx = arr.findIndex(i => Number(i.id) === id);
    if (Number.isNaN(id) || idx === -1) return fail('Не найден элемент для удаления.');
    arr.splice(idx, 1);
  } else {
    return fail('Неизвестная операция.');
  }

  form[listSpec.formKey] = arr;
  base.form = form;
  base[listSpec.projKey] = arr.map((it, index) => deriveProjItem(it, listSpec, index));
  spec.write(projectId, base);
  return ok(proposal.op === 'add_item' ? 'Добавлено новое окно.' : proposal.op === 'delete_item' ? 'Окно удалено.' : 'Формулировка обновлена.');
}

/**
 * Применить одно подтверждённое предложение. Возвращает результат для UI.
 * НЕ вызывается без явного подтверждения пользователя (это делает панель).
 */
export function applyProjectEdit(projectId: number, proposal: Proposal): ApplyResult {
  const cardId = proposal.card_id;
  if (GENERIC_SECTION_IDS.includes(cardId)) return applySectionEdit(projectId, proposal);
  if (isComplexCard(cardId)) return applyComplexEdit(projectId, COMPLEX_CARDS[cardId], proposal);
  return fail('Эту карточку пока нельзя править автоматически — внесите изменение вручную в самой карточке.');
}
