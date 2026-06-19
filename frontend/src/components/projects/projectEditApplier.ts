// Применение подтверждённых правок ИИ-Методолога к карточкам проекта.
// v1: точные правки для секционных карточек («повторяющиеся окна») через ту же чистую
// пересборку снапшота, что и канвас (buildSectionSnapshot) → localStorage + сервер.
// Сложные карточки (Теория/Диагноз/Стратвыбор/Целевое состояние) и OKR в v1 не правятся
// автоматически (у каждой свой большой редактор) — применитель мягко отказывает.
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
import type { Proposal } from './projectReview';

export interface ApplyResult {
  ok: boolean;
  message: string;
}

function fail(message: string): ApplyResult {
  return { ok: false, message };
}

function ok(message: string): ApplyResult {
  return { ok: true, message };
}

// Сопоставить ключи из proposal.values с ключами полей записи: принимаем сам ключ,
// синоним name/название и подпись поля (label, без учёта регистра).
function normalizeValues(config: ScreenConfig, raw: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  const byLabel = new Map<string, string>();
  byLabel.set('название карточки', NAME_KEY);
  byLabel.set('название', NAME_KEY);
  byLabel.set('name', NAME_KEY);
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
    // неизвестные ключи игнорируем (модель могла придумать лишнее поле)
  }
  return out;
}

function loadRecords(projectId: number, cardId: string): RecordState[] {
  const snap = readProjectFrameworkSectionSnapshot(projectId, cardId);
  const form = snap?.form as RecordState[] | undefined;
  return Array.isArray(form) ? form.map(r => ({ id: r.id, values: { ...r.values } })) : [];
}

function nextRecordId(records: RecordState[]): number {
  return records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

/**
 * Применить одно подтверждённое предложение. Возвращает результат для UI.
 * НЕ вызывается без явного подтверждения пользователя (это делает панель).
 */
export function applyProjectEdit(projectId: number, proposal: Proposal): ApplyResult {
  const { card_id: cardId, op } = proposal;
  if (!GENERIC_SECTION_IDS.includes(cardId)) {
    return fail('Эту карточку пока нельзя править автоматически — внесите изменение вручную в самой карточке.');
  }

  const sources = readProjectSources(projectId);
  const config = createConfigs(sources)[cardId];
  if (!config) return fail('Не найдена конфигурация раздела.');

  const records = loadRecords(projectId, cardId);

  if (op === 'add_item') {
    const record = createRecord(config, sources, nextRecordId(records));
    Object.assign(record.values, normalizeValues(config, proposal.values));
    records.push(record);
    writeProjectFrameworkSectionSnapshot(projectId, cardId, buildSectionSnapshot(projectId, config, sources, records));
    return ok('Добавлено новое окно.');
  }

  if (op === 'update_item' || op === 'update_field') {
    const itemId = Number(proposal.item_id);
    const idx = records.findIndex(r => r.id === itemId);
    if (Number.isNaN(itemId) || idx === -1) return fail('Не найден элемент для изменения.');
    // update_field приходит как одно поле/значение; update_item — как объект values.
    const values = op === 'update_field' && proposal.field
      ? normalizeValues(config, { [proposal.field]: proposal.value })
      : normalizeValues(config, proposal.values);
    if (Object.keys(values).length === 0) return fail('Нечего изменять: не указаны поля.');
    records[idx] = { ...records[idx], values: { ...records[idx].values, ...values } };
    writeProjectFrameworkSectionSnapshot(projectId, cardId, buildSectionSnapshot(projectId, config, sources, records));
    return ok('Формулировка обновлена.');
  }

  if (op === 'delete_item') {
    const itemId = Number(proposal.item_id);
    const idx = records.findIndex(r => r.id === itemId);
    if (Number.isNaN(itemId) || idx === -1) return fail('Не найден элемент для удаления.');
    records.splice(idx, 1);
    writeProjectFrameworkSectionSnapshot(projectId, cardId, buildSectionSnapshot(projectId, config, sources, records));
    return ok('Окно удалено.');
  }

  return fail('Неизвестная операция.');
}
