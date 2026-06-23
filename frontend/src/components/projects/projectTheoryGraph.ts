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

// Каждая смысловая связь относится к СЕМЕЙСТВУ (принцип, виден по умолчанию) и имеет точный
// глагол `verb` (деталь, показывается по наведению на связь). Так на карте читается принцип,
// а нюанс — по требованию. Семейства определены ниже (RELATION_FAMILIES).
interface MissionLink { field: string; targetList: string; family: string; verb: string; }
const MISSION_LINKS: MissionLink[] = [
  { field: 'mainBeneficiary', targetList: 'stakeholder', family: 'defines', verb: 'выгодоприобретатель' },
  { field: 'relatedResults', targetList: 'results', family: 'defines', verb: 'результат' },
  { field: 'relatedCompetencies', targetList: 'competencies', family: 'defines', verb: 'компетенция' },
  { field: 'protectRelations', targetList: 'preserve', family: 'defines', verb: 'нельзя нарушить' },
  { field: 'protectRelations', targetList: 'constraints', family: 'defines', verb: 'нельзя нарушить' },
];

// Меж-блочные смысловые ссылки: элемент-источник.поле → элемент целевого блока.
interface BlockLink { sourceList: string; field: string; targetList: string; family: string; verb: string; }
const BLOCK_LINKS: BlockLink[] = [
  { sourceList: 'stakeholder', field: 'resultCriterion', targetList: 'results', family: 'toResult', verb: 'отвечает за' },
  { sourceList: 'results', field: 'requiredCompetencies', targetList: 'competencies', family: 'needsCapability', verb: 'требует' },
  { sourceList: 'competencies', field: 'resultCriterion', targetList: 'results', family: 'toResult', verb: 'обеспечивает' },
  { sourceList: 'constraints', field: 'resultCriterion', targetList: 'results', family: 'toResult', verb: 'ограничивает' },
  { sourceList: 'quality', field: 'resultCriterion', targetList: 'results', family: 'toResult', verb: 'контролирует' },
  { sourceList: 'quality', field: 'beneficiary', targetList: 'stakeholder', family: 'forStakeholder', verb: 'для' },
  { sourceList: 'preserve', field: 'stakeholder', targetList: 'stakeholder', family: 'forStakeholder', verb: 'защищает' },
  { sourceList: 'preserve', field: 'resultCriterion', targetList: 'results', family: 'toResult', verb: 'сохраняет' },
  { sourceList: 'preserve', field: 'constraint', targetList: 'constraints', family: 'withinLimit', verb: 'связано с' },
];

// === Визуальная грамматика связей (масштабируется на все разделы) ===
// ЦВЕТ линии = семейство сущности-цели (единый язык во всех разделах).
// ТИП линии (пунктир/толщина) = РОД связи. Точную семантику несёт подпись на связи.
// Так палитра остаётся читаемой даже когда типов связей станет много.

export const ENTITY_COLORS: { list: string; title: string; color: string }[] = [
  { list: 'stakeholder', title: 'Клиент / выгодоприобретатель', color: '#2563EB' },
  { list: 'results', title: 'Критерии результата', color: '#0891B2' },
  { list: 'competencies', title: 'Компетенции', color: '#7C3AED' },
  { list: 'constraints', title: 'Ограничения', color: '#DC2626' },
  { list: 'quality', title: 'Качество', color: '#CA8A04' },
  { list: 'preserve', title: 'Сохраняемое ядро', color: '#DB2777' },
];
const ENTITY_COLOR = new Map(ENTITY_COLORS.map(e => [e.list, e.color] as const));
export const NEUTRAL_COLOR = '#475569';
/** Цвет по семейству сущности (по ключу списка-блока). Фолбэк — нейтральный. */
export function entityColor(list?: string): string {
  return (list && ENTITY_COLOR.get(list)) || NEUTRAL_COLOR;
}

export type EdgeFamily = 'structural' | 'decomposition' | 'containment' | 'semantic';
export const SEMANTIC_DASH = '6 4';
export const EDGE_FAMILIES: { family: EdgeFamily; title: string; dash: string; width: number }[] = [
  { family: 'structural', title: 'Каркас (раздел → Миссия)', dash: '', width: 3 },
  { family: 'decomposition', title: 'Из Миссии в блоки', dash: '', width: 2.5 },
  { family: 'containment', title: 'Блок → элементы', dash: '', width: 1.5 },
  { family: 'semantic', title: 'Смысловая связь', dash: SEMANTIC_DASH, width: 2 },
];
const FAMILY_BY_KIND: Record<TheoryEdgeKind, EdgeFamily> = {
  section: 'structural', origin: 'decomposition', containment: 'containment', ref: 'semantic',
};
const FAMILY_STYLE = new Map(EDGE_FAMILIES.map(f => [f.family, f] as const));

// Ключ списка-сущности из id узла-цели (block:<list> / item:project-theory:<list>:<id>).
function listOfNode(nodeId: string): string | undefined {
  if (nodeId.startsWith('block:')) return nodeId.slice('block:'.length);
  if (nodeId.startsWith('item:')) return nodeId.split(':')[2];
  return undefined;
}

/** Визуал ребра по грамматике: цвет (= сущность-цель), пунктир и толщина (= род связи). */
export function edgeVisual(kind: TheoryEdgeKind, targetId: string): { color: string; dash: string; width: number } {
  const fs = FAMILY_STYLE.get(FAMILY_BY_KIND[kind])!;
  const color = kind === 'section' ? NEUTRAL_COLOR : entityColor(listOfNode(targetId));
  return { color, dash: fs.dash, width: fs.width };
}

// Семейства смысловых связей — это и есть «принцип» карты (4–5 вместо 13 глаголов).
// Точные глаголы остаются на связях (verb) и видны по наведению. about — пояснение для легенды,
// color — представительный цвет (совпадает с сущностью-целью; у «определяет» цель разная → нейтральный).
export interface RelationFamily { id: string; label: string; about: string; color: string }
export const RELATION_FAMILIES: RelationFamily[] = [
  { id: 'defines', label: 'определяет', about: 'Миссия задаёт грани Теории (цвет — по цели)', color: NEUTRAL_COLOR },
  { id: 'toResult', label: 'вклад в результат', about: 'элемент влияет на измеримый критерий', color: '#0891B2' },
  { id: 'forStakeholder', label: 'в интересах', about: 'элемент служит стейкхолдеру', color: '#2563EB' },
  { id: 'needsCapability', label: 'требует способности', about: 'результат опирается на компетенцию', color: '#7C3AED' },
  { id: 'withinLimit', label: 'в рамках ограничения', about: 'связь с ограничением-границей', color: '#DC2626' },
];
const FAMILY_LABEL = new Map(RELATION_FAMILIES.map(f => [f.id, f.label] as const));
const familyLabel = (id: string): string => FAMILY_LABEL.get(id) ?? id;

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
// family — подпись-семейство (по умолчанию на карте), verb — точный глагол (показываем по наведению).
export interface TheoryEdge { id: string; source: string; target: string; kind: TheoryEdgeKind; label?: string; family?: string; verb?: string; }
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
      edges.push({ id: `ref:m:${seq++}`, source: MISSION_NODE_ID, target, kind: 'ref', family: familyLabel(link.family), verb: link.verb });
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
        edges.push({ id: `ref:b:${seq++}:${source}->${target}`, source, target, kind: 'ref', family: familyLabel(link.family), verb: link.verb });
      }
    }
  }

  return { nodes, edges };
}
