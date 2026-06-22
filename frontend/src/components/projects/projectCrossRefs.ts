// Реестр прямых связей между элементами карточек + резолвер для графа.
// Поле-связь резолвится так: если задан refField со составным id `card:list:itemId` — по id;
// иначе фолбэк — матч текстового proseField с меткой элемента цели (так старые текстовые
// значения связываются автоматически, без миграции данных).
import { buildProjectEditModel, type EditableItem, type ProjectEditModel } from './projectEditModel';

export interface CrossRefEntry {
  sourceCard: string;
  sourceList: string;   // список элементов-источников
  proseField: string;   // текстовое поле-обоснование (фолбэк-матч по лейблу)
  refField?: string;    // поле со составным id выбранного элемента (приоритет)
  targetCard: string;
  targetList: string;
  edgeLabel: string;
}

export const CROSS_REFS: CrossRefEntry[] = [
  // Внутри Теории (структурные ref — резолв по лейблу, как и раньше).
  { sourceCard: 'project-theory', sourceList: 'stakeholder', proseField: 'resultCriterion', targetCard: 'project-theory', targetList: 'results', edgeLabel: 'отвечает за' },
  { sourceCard: 'project-theory', sourceList: 'results', proseField: 'requiredCompetencies', targetCard: 'project-theory', targetList: 'competencies', edgeLabel: 'требует' },
  { sourceCard: 'project-theory', sourceList: 'competencies', proseField: 'resultCriterion', targetCard: 'project-theory', targetList: 'results', edgeLabel: 'обеспечивает' },
  { sourceCard: 'project-theory', sourceList: 'constraints', proseField: 'resultCriterion', targetCard: 'project-theory', targetList: 'results', edgeLabel: 'ограничивает' },
  { sourceCard: 'project-theory', sourceList: 'quality', proseField: 'resultCriterion', targetCard: 'project-theory', targetList: 'results', edgeLabel: 'контролирует' },
  { sourceCard: 'project-theory', sourceList: 'quality', proseField: 'beneficiary', targetCard: 'project-theory', targetList: 'stakeholder', edgeLabel: 'для' },
  { sourceCard: 'project-theory', sourceList: 'preserve', proseField: 'stakeholder', targetCard: 'project-theory', targetList: 'stakeholder', edgeLabel: 'защищает' },
  { sourceCard: 'project-theory', sourceList: 'preserve', proseField: 'resultCriterion', targetCard: 'project-theory', targetList: 'results', edgeLabel: 'сохраняет' },
  { sourceCard: 'project-theory', sourceList: 'preserve', proseField: 'constraint', targetCard: 'project-theory', targetList: 'constraints', edgeLabel: 'связано с' },
  // Меж-карточные (структурные пикеры): Стратвыбор → Диагноз.
  { sourceCard: 'strategic-choice', sourceList: 'alternatives', proseField: 'diagnosisFit', refField: 'diagnosisFitRef', targetCard: 'diagnosis', targetList: 'symptoms', edgeLabel: 'отвечает на' },
];

export interface RefOption { value: string; label: string; }

const itemNodeId = (card: string, list: string, itemId: string) => `item:${card}:${list}:${itemId}`;
export const crossRefValue = (targetCard: string, targetList: string, itemId: string) => `${targetCard}:${targetList}:${itemId}`;

function itemsOf(model: ProjectEditModel, card: string, list: string): EditableItem[] {
  const c = model.editable_cards.find(x => x.card_id === card);
  return c?.lists.find(l => l.list === list)?.items ?? [];
}

/** Опции пикера: реальные элементы целевого списка (value = составной id, label = метка). */
export function crossRefOptions(projectId: number, targetCard: string, targetList: string, model?: ProjectEditModel): RefOption[] {
  const m = model ?? buildProjectEditModel(projectId);
  return itemsOf(m, targetCard, targetList)
    .filter(it => it.label.trim())
    .map(it => ({ value: crossRefValue(targetCard, targetList, String(it.id)), label: it.label.trim() }));
}

export interface ResolvedRef { source: string; target: string; label: string; }

// id целевого элемента: сперва по refField (составной id), иначе матч proseField по лейблу.
function resolveTargetId(entry: CrossRefEntry, values: Record<string, string>, targetByLabel: Map<string, string>): string | null {
  const prefix = `${entry.targetCard}:${entry.targetList}:`;
  if (entry.refField) {
    const raw = (values[entry.refField] ?? '').trim();
    if (raw.startsWith(prefix)) return raw.slice(prefix.length);
  }
  const prose = (values[entry.proseField] ?? '').trim();
  for (const token of prose.split(/[;,]\s*/).map(t => t.trim()).filter(Boolean)) {
    const id = targetByLabel.get(token.toLowerCase());
    if (id) return id;
  }
  return null;
}

/** Резолв всех связей реестра в пары узлов-элементов для графа. */
export function crossRefEdges(projectId: number, model?: ProjectEditModel): ResolvedRef[] {
  const m = model ?? buildProjectEditModel(projectId);
  const targetCache = new Map<string, Map<string, string>>();
  const targetsByLabel = (card: string, list: string) => {
    const key = `${card}:${list}`;
    let map = targetCache.get(key);
    if (!map) {
      map = new Map<string, string>();
      for (const it of itemsOf(m, card, list)) if (it.label.trim()) map.set(it.label.trim().toLowerCase(), String(it.id));
      targetCache.set(key, map);
    }
    return map;
  };

  const out: ResolvedRef[] = [];
  for (const entry of CROSS_REFS) {
    const targets = targetsByLabel(entry.targetCard, entry.targetList);
    for (const src of itemsOf(m, entry.sourceCard, entry.sourceList)) {
      const targetId = resolveTargetId(entry, src.values, targets);
      if (!targetId) continue;
      const source = itemNodeId(entry.sourceCard, entry.sourceList, String(src.id));
      const target = itemNodeId(entry.targetCard, entry.targetList, targetId);
      if (source === target) continue;
      out.push({ source, target, label: entry.edgeLabel });
    }
  }
  return out;
}
