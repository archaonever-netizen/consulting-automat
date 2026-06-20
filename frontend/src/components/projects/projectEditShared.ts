// Общие хелперы применения правок Методолога — переиспользуются и сложными карточками
// (projectEditApplier), и адаптером Теории проекта (projectTheoryCards), чтобы разбор
// массивов и толерантный поиск элемента работали одинаково везде.
import type { FormItem } from './projectComplexCards';

// Толерантный поиск элемента: модель может прислать точный id, индекс или метку.
// Совпадение по id → по метке (точно/частично) → единственный элемент.
export function pickIndex<T>(items: T[], rawId: unknown, idOf: (item: T) => string, labelOf: (item: T) => string): number {
  const raw = (rawId ?? '').toString().trim();
  if (raw) {
    let idx = items.findIndex(it => idOf(it) === raw);
    if (idx !== -1) return idx;
    const lc = raw.toLowerCase();
    idx = items.findIndex(it => labelOf(it).trim().toLowerCase() === lc);
    if (idx !== -1) return idx;
    if (lc.length >= 3) {
      idx = items.findIndex(it => labelOf(it).toLowerCase().includes(lc));
      if (idx !== -1) return idx;
    }
  }
  return items.length === 1 ? 0 : -1;
}

/** Свести значения от модели в элемент form: array-поля режем по `;`/`,`, скаляры приводим
 * к строке; ключ `name`/«название» алиасим на поле name, если оно есть. */
export function mergeItemValues(item: FormItem, values: Record<string, unknown> | undefined) {
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
