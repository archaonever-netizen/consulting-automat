// Свидетельства проверки гипотезы (Этап A инструмента «Проверки», CHECKS_WORKBENCH).
//
// «Проверка» (карточка секции `experiments`) накапливает свидетельства — файлы, ссылки,
// данные, заметки, — каждое со своей позицией «за/против» и измеренным значением. Это
// материал, на котором строится ОБЪЕКТИВНЫЙ вердикт: критерий задаётся заранее (пороги),
// а вердикт сверяется с собранными свидетельствами, а не ставится «на глаз».
//
// Свидетельства лежат изолированным полем `evidence` в lossless-снапшоте секции `experiments`
// (тот же приём, что `lifecycle`/`importance` у гипотез): JSON-строка со списком. Сами файлы —
// в Supabase Storage, здесь только метаданные (`storagePath`). Общий `config.fields` и «замок
// контракта» не трогаем. Это чистая логика без побочных эффектов.

export type EvidenceKind = 'file' | 'link' | 'data' | 'note';
export type EvidenceStance = 'за' | 'против' | 'нейтрально';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  title: string;
  stance: EvidenceStance;
  measuredValue: string;   // что измерили — для сверки с порогом
  storagePath?: string;    // для kind==='file': путь объекта в Supabase Storage
  url?: string;            // для kind==='link'
  mime?: string;
  size?: number;
  addedAt: string;         // ISO-метка добавления
}

export const EVIDENCE_KINDS: Array<{ key: EvidenceKind; label: string }> = [
  { key: 'file', label: 'Файл' },
  { key: 'link', label: 'Ссылка' },
  { key: 'data', label: 'Данные' },
  { key: 'note', label: 'Заметка' },
];

export const EVIDENCE_STANCES: Array<{ key: EvidenceStance; label: string }> = [
  { key: 'за', label: 'За — подтверждает' },
  { key: 'против', label: 'Против — опровергает' },
  { key: 'нейтрально', label: 'Нейтрально' },
];

const KIND_KEYS = EVIDENCE_KINDS.map(item => item.key);
const STANCE_KEYS = EVIDENCE_STANCES.map(item => item.key);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asKind(value: unknown): EvidenceKind {
  return (KIND_KEYS as string[]).includes(value as string) ? (value as EvidenceKind) : 'note';
}

function asStance(value: unknown): EvidenceStance {
  return (STANCE_KEYS as string[]).includes(value as string) ? (value as EvidenceStance) : 'нейтрально';
}

let idCounter = 0;
/** Идентификатор свидетельства, уникальный в пределах сессии. */
function makeId(): string {
  idCounter += 1;
  return `ev-${Date.now().toString(36)}-${idCounter}`;
}

/** Безопасный разбор поля `evidence` (JSON-строка). Любой мусор → пустой список. */
export function parseEvidence(raw: string | undefined): Evidence[] {
  if (!raw || !raw.trim()) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map(item => ({
      id: asString(item.id) || makeId(),
      kind: asKind(item.kind),
      title: asString(item.title),
      stance: asStance(item.stance),
      measuredValue: asString(item.measuredValue),
      storagePath: asString(item.storagePath) || undefined,
      url: asString(item.url) || undefined,
      mime: asString(item.mime) || undefined,
      size: typeof item.size === 'number' ? item.size : undefined,
      addedAt: asString(item.addedAt),
    }));
}

/** Сериализация списка свидетельств в строку для поля `evidence`. */
export function serializeEvidence(items: Evidence[]): string {
  return JSON.stringify(items);
}

/** Свидетельства проверки из её значений. */
export function evidenceOf(values: Record<string, string>): Evidence[] {
  return parseEvidence(values.evidence);
}

export interface EvidenceSummary {
  total: number;
  for: number;       // свидетельств «за»
  against: number;   // свидетельств «против»
  neutral: number;
  measured: number;  // со внесённым измеренным значением
}

/** Сводка по свидетельствам: сколько за/против/нейтрально и сколько с измерением. */
export function summarizeEvidence(items: Evidence[]): EvidenceSummary {
  const summary: EvidenceSummary = { total: items.length, for: 0, against: 0, neutral: 0, measured: 0 };
  for (const item of items) {
    if (item.stance === 'за') summary.for += 1;
    else if (item.stance === 'против') summary.against += 1;
    else summary.neutral += 1;
    if (item.measuredValue.trim()) summary.measured += 1;
  }
  return summary;
}

/** Создать свидетельство с заполненными значениями по умолчанию. */
export function createEvidence(partial: Partial<Evidence> = {}): Evidence {
  return {
    id: partial.id || makeId(),
    kind: partial.kind ?? 'note',
    title: partial.title ?? '',
    stance: partial.stance ?? 'нейтрально',
    measuredValue: partial.measuredValue ?? '',
    storagePath: partial.storagePath,
    url: partial.url,
    mime: partial.mime,
    size: partial.size,
    addedAt: partial.addedAt ?? new Date().toISOString(),
  };
}
