// Модель графа экрана «Весь проект» в режиме Теории проекта.
// Только project-theory: Миссия-корень + 6 блоков Теории (в порядке экрана) + их элементы + связи.
// Без бэкбона методологии и чужих кластеров (остальные разделы подключим отдельными экранами).
// Чистая функция buildTheoryGraph — только данные, без раскладки/UI.
//
// Связи двух видов:
//   • origin (структурные, всегда видны): Миссия → каждый из 6 блоков — «из Миссии вытекают эти блоки»;
//   • ref (смысловые, показываются по наведению):
//       — точные ссылки Миссии на выбранные элементы (mainBeneficiary/relatedResults/…);
//       — меж-блочные ссылки элементов (resultCriterion/requiredCompetencies/beneficiary/…).
// Резолв ref — по совпадению лейбла (значения ссылочных полей в модели уже отображаются как лейблы).
import { buildProjectEditModel, type EditableCard, type EditableItem, type ProjectEditModel } from './projectEditModel';

export const THEORY_CARD_ID = 'project-theory';
export const SECTION_NODE_ID = 'section:project-theory';
export const MISSION_NODE_ID = 'mission';

// Блоки Теории строго в порядке экрана (list = ключ списка в модели Теории, nameField — куда писать имя при +).
export interface TheoryBlockSpec { list: string; title: string; nameField: string; }
export const THEORY_BLOCKS: TheoryBlockSpec[] = [
  { list: 'stakeholder', title: 'Клиент / выгодоприобретатель', nameField: 'details' },
  { list: 'results', title: 'Критерии результата', nameField: 'statement' },
  { list: 'competencies', title: 'Ключевые компетенции', nameField: 'name' },
  { list: 'constraints', title: 'Ограничения', nameField: 'statement' },
  { list: 'quality', title: 'Качество', nameField: 'requirement' },
  { list: 'preserve', title: 'Что нельзя разрушить', nameField: 'details' },
];

// Точные ссылки Миссии: поле миссии → блок-цель. protectRelations указывает и на preserve, и на ограничения.
interface MissionLink { field: string; targetList: string; label: string; }
const MISSION_LINKS: MissionLink[] = [
  { field: 'mainBeneficiary', targetList: 'stakeholder', label: 'выгодоприобретатель' },
  { field: 'relatedResults', targetList: 'results', label: 'результат' },
  { field: 'relatedCompetencies', targetList: 'competencies', label: 'компетенция' },
  { field: 'protectRelations', targetList: 'preserve', label: 'нельзя нарушить' },
  { field: 'protectRelations', targetList: 'constraints', label: 'нельзя нарушить' },
];

// Меж-блочные смысловые ссылки: элемент-источник.поле → элемент целевого блока.
interface BlockLink { sourceList: string; field: string; targetList: string; label: string; }
const BLOCK_LINKS: BlockLink[] = [
  { sourceList: 'stakeholder', field: 'resultCriterion', targetList: 'results', label: 'отвечает за' },
  { sourceList: 'results', field: 'requiredCompetencies', targetList: 'competencies', label: 'требует' },
  { sourceList: 'competencies', field: 'resultCriterion', targetList: 'results', label: 'обеспечивает' },
  { sourceList: 'constraints', field: 'resultCriterion', targetList: 'results', label: 'ограничивает' },
  { sourceList: 'quality', field: 'resultCriterion', targetList: 'results', label: 'контролирует' },
  { sourceList: 'quality', field: 'beneficiary', targetList: 'stakeholder', label: 'для' },
  { sourceList: 'preserve', field: 'stakeholder', targetList: 'stakeholder', label: 'защищает' },
  { sourceList: 'preserve', field: 'resultCriterion', targetList: 'results', label: 'сохраняет' },
  { sourceList: 'preserve', field: 'constraint', targetList: 'constraints', label: 'связано с' },
];

// === Типы графа (type-алиасы — чтобы data приводились к Record<string, unknown> для React Flow) ===
// Верхний «слой разделов»: карточка-раздел (ссылка на экран), из которой выходит корень раздела.
// Пока слой содержит один раздел — «Теория проекта»; позже сюда добавятся остальные экраны.
export type TheorySectionData = { kind: 'section'; cardId: string; title: string; subtitle: string };
export type TheoryMissionData = { kind: 'mission'; title: string; statement: string; isEmpty: boolean };
export type TheoryBlockData = {
  kind: 'block'; list: string; title: string; index: number;
  itemCount: number; isEmpty: boolean; expanded: boolean; expandable: boolean;
};
export type TheoryItemData = { kind: 'item'; list: string; itemId: string; label: string; blockTitle: string };

export type TheoryNode =
  | { id: string; type: 'sectionNode'; data: TheorySectionData }
  | { id: string; type: 'missionNode'; data: TheoryMissionData }
  | { id: string; type: 'blockNode'; data: TheoryBlockData }
  | { id: string; type: 'itemNode'; data: TheoryItemData };

export type TheoryEdgeKind = 'section' | 'origin' | 'ref' | 'containment';
export interface TheoryEdge { id: string; source: string; target: string; kind: TheoryEdgeKind; label?: string; }
export interface TheoryGraph { nodes: TheoryNode[]; edges: TheoryEdge[]; }

// === id-хелперы ===
const blockNodeId = (list: string) => `block:${list}`;
const itemNodeId = (list: string, itemId: string) => `item:${THEORY_CARD_ID}:${list}:${itemId}`;
const trimmed = (v?: string) => (v ?? '').trim();
const hasContent = (item: EditableItem) => Object.values(item.values).some(v => trimmed(v));
const tokenize = (v?: string) => trimmed(v).split(/[;,]\s*/).map(t => t.trim().toLowerCase()).filter(Boolean);

function theoryCard(model: ProjectEditModel): EditableCard | undefined {
  return model.editable_cards.find(c => c.card_id === THEORY_CARD_ID);
}
function missionStatement(card: EditableCard | undefined): string {
  const fields = card?.fields ?? [];
  const get = (k: string) => trimmed(fields.find(f => f.key === k)?.value);
  return get('finalStatement') || get('victoryState') || get('problem') || '';
}
function missionFilled(card: EditableCard | undefined): boolean {
  return (card?.fields ?? []).some(f => trimmed(f.value));
}

export function buildTheoryGraph(projectId: number, expanded: ReadonlySet<string> = new Set(), model?: ProjectEditModel): TheoryGraph {
  const m = model ?? buildProjectEditModel(projectId);
  const card = theoryCard(m);

  const nodes: TheoryNode[] = [];
  const edges: TheoryEdge[] = [];

  // Верхний слой: карточка-раздел «Теория проекта» (ссылка на экран); из неё выходит Миссия.
  nodes.push({
    id: SECTION_NODE_ID, type: 'sectionNode',
    data: { kind: 'section', cardId: THEORY_CARD_ID, title: 'Теория проекта', subtitle: 'Раздел проекта' },
  });
  edges.push({ id: 'section:theory->mission', source: SECTION_NODE_ID, target: MISSION_NODE_ID, kind: 'section', label: 'миссия' });

  // Миссия — корень
  nodes.push({
    id: MISSION_NODE_ID, type: 'missionNode',
    data: { kind: 'mission', title: 'Миссия проекта', statement: missionStatement(card), isEmpty: !missionFilled(card) },
  });

  // Содержательные элементы блоков + индекс лейблов (для резолва связей)
  const itemsByList = new Map<string, EditableItem[]>();
  const labelIndex = new Map<string, Map<string, string>>(); // list → (labelLC → itemId)
  for (const b of THEORY_BLOCKS) {
    const items = (card?.lists.find(l => l.list === b.list)?.items ?? []).filter(hasContent);
    itemsByList.set(b.list, items);
    const idx = new Map<string, string>();
    for (const it of items) { const lbl = it.label.trim().toLowerCase(); if (lbl) idx.set(lbl, String(it.id)); }
    labelIndex.set(b.list, idx);
  }

  // Блоки + элементы раскрытых блоков; запоминаем присутствующие узлы-элементы
  const presentItems = new Set<string>();
  THEORY_BLOCKS.forEach((b, index) => {
    const items = itemsByList.get(b.list) ?? [];
    nodes.push({
      id: blockNodeId(b.list), type: 'blockNode',
      data: { kind: 'block', list: b.list, title: b.title, index, itemCount: items.length, isEmpty: items.length === 0, expanded: expanded.has(b.list), expandable: items.length > 0 },
    });
    // структурное ребро Миссия → блок (всегда видно)
    edges.push({ id: `origin:${b.list}`, source: MISSION_NODE_ID, target: blockNodeId(b.list), kind: 'origin' });

    if (expanded.has(b.list)) {
      for (const it of items) {
        const nid = itemNodeId(b.list, String(it.id));
        presentItems.add(nid);
        nodes.push({ id: nid, type: 'itemNode', data: { kind: 'item', list: b.list, itemId: String(it.id), label: it.label, blockTitle: b.title } });
        edges.push({ id: `containment:${nid}`, source: blockNodeId(b.list), target: nid, kind: 'containment' });
      }
    }
  });

  // Смысловые ref-связи строим только между присутствующими (раскрытыми) элементами.
  const missionFields = new Map((card?.fields ?? []).map(f => [f.key, f.value] as const));
  let seq = 0;

  for (const link of MISSION_LINKS) {
    const idx = labelIndex.get(link.targetList);
    if (!idx) continue;
    for (const token of tokenize(missionFields.get(link.field))) {
      const id = idx.get(token);
      if (!id) continue;
      const target = itemNodeId(link.targetList, id);
      if (!presentItems.has(target)) continue;
      edges.push({ id: `ref:m:${seq++}`, source: MISSION_NODE_ID, target, kind: 'ref', label: link.label });
    }
  }

  for (const link of BLOCK_LINKS) {
    const idx = labelIndex.get(link.targetList);
    if (!idx) continue;
    for (const src of itemsByList.get(link.sourceList) ?? []) {
      const source = itemNodeId(link.sourceList, String(src.id));
      if (!presentItems.has(source)) continue;
      for (const token of tokenize(src.values[link.field])) {
        const id = idx.get(token);
        if (!id) continue;
        const target = itemNodeId(link.targetList, id);
        if (target === source || !presentItems.has(target)) continue;
        edges.push({ id: `ref:b:${seq++}:${source}->${target}`, source, target, kind: 'ref', label: link.label });
      }
    }
  }

  return { nodes, edges };
}
