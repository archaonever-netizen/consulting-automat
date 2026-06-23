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
  itemLabel,
  normalizeRefFields,
  refMissingMessage,
  resolveRefOption,
  type ComplexCardSpec,
  type ComplexListSpec,
  type FormItem,
  type RefMiss,
  type Snapshot,
} from './projectComplexCards';
import { mergeItemValues, pickIndex } from './projectEditShared';
import { THEORY_CARD_ID, applyTheoryEdit, isTheoryCard } from './projectTheoryCards';
import { OKR_CARD_ID, applyOkrEdit, isOkrCard } from './projectOkrCards';
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
  const labelOf = (r: RecordState) => r.values[NAME_KEY] || r.values[config.primaryField] || '';

  if (op === 'add_item') {
    const record = createRecord(config, sources, nextId);
    Object.assign(record.values, normalizeValues(config, proposal.values));
    records.push(record);
  } else if (op === 'update_item' || op === 'update_field') {
    const idx = pickIndex(records, proposal.item_id, r => String(r.id), labelOf);
    if (idx === -1) return fail('Не найден элемент для изменения.');
    const values = op === 'update_field' && proposal.field
      ? normalizeValues(config, { [proposal.field]: proposal.value })
      : normalizeValues(config, proposal.values);
    if (Object.keys(values).length === 0) return fail('Нечего изменять: не указаны поля.');
    records[idx] = { ...records[idx], values: { ...records[idx].values, ...values } };
  } else if (op === 'delete_item') {
    const idx = pickIndex(records, proposal.item_id, r => String(r.id), labelOf);
    if (idx === -1) return fail('Не найден элемент для удаления.');
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

function findList(spec: ComplexCardSpec, name: string | undefined): ComplexListSpec | undefined {
  if (name) {
    const lc = name.trim().toLowerCase();
    const byKey = spec.lists.find(l => l.projKey.toLowerCase() === lc || l.formKey.toLowerCase() === lc);
    if (byKey) return byKey;
    const byTitle = spec.lists.find(l => l.title.toLowerCase() === lc || `${l.title}s`.toLowerCase() === lc);
    if (byTitle) return byTitle;
  }
  return spec.lists.length === 1 ? spec.lists[0] : undefined;
}

// Если модель не указала list, угадываем его по ключам значений (для add/update)…
function inferListByValues(spec: ComplexCardSpec, values: Record<string, unknown> | undefined): ComplexListSpec | undefined {
  const keys = Object.keys(values || {});
  if (!keys.length) return undefined;
  let best: ComplexListSpec | undefined;
  let bestScore = 0;
  for (const ls of spec.lists) {
    if (!ls.createItem) continue;
    const blank = ls.createItem(0) as Record<string, unknown>;
    const score = keys.filter(k => k in blank).length;
    if (score > bestScore) {
      bestScore = score;
      best = ls;
    }
  }
  return bestScore > 0 ? best : undefined;
}

// …или по тому, в каком списке реально есть элемент с указанным item_id (для update/delete).
function inferListByItemId(spec: ComplexCardSpec, form: Record<string, unknown>, itemId: unknown): ComplexListSpec | undefined {
  for (const ls of spec.lists) {
    const arr = Array.isArray(form[ls.formKey]) ? (form[ls.formKey] as FormItem[]) : [];
    const idx = pickIndex(arr, itemId, i => String(i.id), it => itemLabel(it, ls.labelKeys, ''));
    if (idx !== -1) return ls;
  }
  return undefined;
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
    let value = proposal.value == null ? '' : String(proposal.value);
    // Скаляр-ссылка: нормализуем к существующей цели; ненайденную не пишем, просим дозаполнить.
    if (fieldSpec?.refOptions && value.trim()) {
      const canon = resolveRefOption(fieldSpec.refOptions(form, projectId), value);
      if (!canon) return ok(refMissingMessage([{ field: key, targetTitle: fieldSpec.refTargetTitle ?? 'элемент', text: value.trim() }]));
      value = canon;
    }
    container[key] = value;
    form[spec.scalarContainer] = container;
    base.form = form;
    const projKey = fieldSpec?.projKey ?? key;
    if (projKey in base) base[projKey] = container[key];
    spec.write(projectId, base);
    return ok('Формулировка обновлена.');
  }

  let listSpec = findList(spec, proposal.list);
  if (!listSpec) {
    if (proposal.op === 'add_item' || proposal.op === 'update_item') listSpec = inferListByValues(spec, proposal.values);
    if (!listSpec && (proposal.op === 'update_item' || proposal.op === 'delete_item')) listSpec = inferListByItemId(spec, form, proposal.item_id);
  }
  if (!listSpec) return fail('Не понял, какой список менять — укажите раздел карточки явно.');
  const arr = (Array.isArray(form[listSpec.formKey]) ? [...(form[listSpec.formKey] as FormItem[])] : []) as FormItem[];
  const labelOf = (it: FormItem, index = 0) => itemLabel(it, listSpec.labelKeys, `${listSpec.title} ${index + 1}`);

  // Поля-ссылки нормализуем к существующему элементу (выбор из реальных вариантов); ненайденные
  // не пишем «как есть», а просим дозаполнить — чтобы Методолог не плодил «битые» связи.
  const refMiss: RefMiss[] = [];

  if (proposal.op === 'add_item') {
    if (!listSpec.createItem) return fail(`В список «${listSpec.title}» нельзя добавлять элементы автоматически.`);
    const item = listSpec.createItem(nextItemId(arr));
    const norm = normalizeRefFields(listSpec, form, proposal.values, projectId);
    refMiss.push(...norm.missing);
    mergeItemValues(item, norm.values);
    arr.push(item);
  } else if (proposal.op === 'update_item') {
    const idx = pickIndex(arr, proposal.item_id, i => String(i.id), it => labelOf(it));
    if (idx === -1) return fail('Не найден элемент для изменения.');
    const item = { ...arr[idx] };
    const norm = normalizeRefFields(listSpec, form, proposal.values ?? (proposal.field ? { [proposal.field]: proposal.value } : undefined), projectId);
    refMiss.push(...norm.missing);
    mergeItemValues(item, norm.values);
    arr[idx] = item;
  } else if (proposal.op === 'delete_item') {
    const idx = pickIndex(arr, proposal.item_id, i => String(i.id), it => labelOf(it));
    if (idx === -1) return fail('Не найден элемент для удаления.');
    arr.splice(idx, 1);
  } else {
    return fail('Неизвестная операция.');
  }

  form[listSpec.formKey] = arr;
  base.form = form;
  base[listSpec.projKey] = arr.map((it, index) => deriveProjItem(it, listSpec, index));
  spec.write(projectId, base);
  const base_msg = proposal.op === 'add_item' ? 'Добавлено новое окно.' : proposal.op === 'delete_item' ? 'Окно удалено.' : 'Формулировка обновлена.';
  return ok(refMiss.length ? `${base_msg} ${refMissingMessage(refMiss)}` : base_msg);
}

// Модель иногда присылает в card_id название карточки вместо её id — сопоставляем.
function resolveCardId(projectId: number, raw: string): string {
  if (GENERIC_SECTION_IDS.includes(raw) || isComplexCard(raw) || isTheoryCard(raw) || isOkrCard(raw)) return raw;
  const lc = (raw || '').trim().toLowerCase();
  if (!lc) return raw;
  if (lc === 'теория проекта') return THEORY_CARD_ID;
  if (lc === 'okr / kpi' || lc === 'okr/kpi' || lc === 'okr') return OKR_CARD_ID;
  for (const id of Object.keys(COMPLEX_CARDS)) {
    if (COMPLEX_CARDS[id].title.toLowerCase() === lc) return id;
  }
  const configs = createConfigs(readProjectSources(projectId));
  for (const id of GENERIC_SECTION_IDS) {
    if (configs[id]?.title.toLowerCase() === lc) return id;
  }
  return raw;
}

/**
 * Применить одно подтверждённое предложение. Возвращает результат для UI.
 * НЕ вызывается без явного подтверждения пользователя (это делает панель).
 */
export function applyProjectEdit(projectId: number, proposal: Proposal): ApplyResult {
  const cardId = resolveCardId(projectId, proposal.card_id);
  const resolved = cardId === proposal.card_id ? proposal : { ...proposal, card_id: cardId };
  if (GENERIC_SECTION_IDS.includes(cardId)) return applySectionEdit(projectId, resolved);
  if (isComplexCard(cardId)) return applyComplexEdit(projectId, COMPLEX_CARDS[cardId], resolved);
  if (isTheoryCard(cardId)) return applyTheoryEdit(projectId, resolved);
  if (isOkrCard(cardId)) return applyOkrEdit(projectId, resolved);
  return fail(`Эту карточку («${proposal.card_id}») пока нельзя править автоматически — внесите изменение вручную.`);
}
