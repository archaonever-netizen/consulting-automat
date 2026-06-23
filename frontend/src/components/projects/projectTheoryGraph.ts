// Модель графа экрана «Весь проект» для содержательных разделов.
// Базовый слой — Теория проекта; рядом подключается Стратегический выбор.
// Без бэкбона методологии и чужих кластеров.
// Чистая функция buildTheoryGraph — только данные, без раскладки/UI.
//
// Связи двух видов:
//   • origin (структурные, всегда видны): Миссия → каждый из 6 блоков — «из Миссии вытекают эти блоки»;
//   • ref (смысловые, показываются по наведению):
//       — точные ссылки Миссии на выбранные элементы (mainBeneficiary/relatedResults/…);
//       — меж-блочные ссылки элементов (resultCriterion/requiredCompetencies/beneficiary/…).
// Резолв ref — по совпадению лейбла (значения ссылочных полей в модели уже отображаются как лейблы).
import { buildProjectEditModel, type EditableCard, type EditableItem, type ProjectEditModel } from './projectEditModel';
import { PROJECT_THEORY_BLOCKS } from './projectTheorySnapshot';

export const THEORY_CARD_ID = 'project-theory';
export const SECTION_NODE_ID = 'section:project-theory';
export const MISSION_NODE_ID = 'mission';
export const STRATEGY_CARD_ID = 'strategic-choice';
export const STRATEGY_SECTION_NODE_ID = 'section:strategic-choice';
export const STRATEGY_ROOT_NODE_ID = 'root:strategic-choice';
export const DIAGNOSIS_CARD_ID = 'diagnosis';
export const DIAGNOSIS_SECTION_NODE_ID = 'section:diagnosis';
export const DIAGNOSIS_ROOT_NODE_ID = 'root:diagnosis';

interface SectionLink { source: string; target: string; label: string }
// Методологическая цепочка разделов в верхнем слое: Теория → Диагноз → Стратегический выбор.
const SECTION_LINKS: SectionLink[] = [
  { source: SECTION_NODE_ID, target: DIAGNOSIS_SECTION_NODE_ID, label: 'проверяется диагнозом' },
  { source: DIAGNOSIS_SECTION_NODE_ID, target: STRATEGY_SECTION_NODE_ID, label: 'обосновывает выбор' },
];

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

export interface StrategyBlockSpec { list: string; title: string; nameField: string; }
export const STRATEGY_BLOCKS: StrategyBlockSpec[] = [
  { list: 'capabilities', title: 'Capabilities', nameField: 'name' },
  { list: 'alternatives', title: 'Стратегические альтернативы', nameField: 'name' },
  { list: 'tradeOffs', title: 'Trade-offs', nameField: 'name' },
  { list: 'actions', title: 'Coherent actions', nameField: 'name' },
  { list: 'hypotheses', title: 'Гипотезы выбора', nameField: 'name' },
];

// Блоки Диагноза строго в порядке экрана. addable=false для «Разрывов» — они засеяны из блоков
// Теории (createItem: null в projectComplexCards), новые строки методолог не плодит.
export interface DiagnosisBlockSpec { list: string; title: string; nameField: string; addable: boolean; }
export const DIAGNOSIS_BLOCKS: DiagnosisBlockSpec[] = [
  { list: 'gaps', title: 'Разрывы теории и реальности', nameField: 'gap', addable: false },
  { list: 'symptoms', title: 'Симптомы', nameField: 'description', addable: true },
  { list: 'facts', title: 'Факты', nameField: 'indicator', addable: true },
  { list: 'alternatives', title: 'Альтернативные объяснения', nameField: 'reason', addable: true },
  { list: 'verifications', title: 'Проверки диагноза', nameField: 'subject', addable: true },
  { list: 'consequences', title: 'Последствия без изменений', nameField: 'deterioration', addable: true },
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
  { list: 'capabilities', title: 'Capabilities', color: '#7C3AED' },
  { list: 'alternatives', title: 'Альтернативы выбора', color: '#0891B2' },
  { list: 'tradeOffs', title: 'Trade-offs', color: '#DC2626' },
  { list: 'actions', title: 'Coherent actions', color: '#16A34A' },
  { list: 'hypotheses', title: 'Гипотезы выбора', color: '#CA8A04' },
  // Диагноз — цвет назначаем только сущностям-целям связей (разрыв/факт/симптом).
  { list: 'gaps', title: 'Разрывы (Диагноз)', color: '#B45309' },
  { list: 'facts', title: 'Факты (Диагноз)', color: '#0D9488' },
  { list: 'symptoms', title: 'Симптомы (Диагноз)', color: '#C026D3' },
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
  section: 'structural', sectionLink: 'structural', origin: 'decomposition', containment: 'containment', ref: 'semantic',
};
const FAMILY_STYLE = new Map(EDGE_FAMILIES.map(f => [f.family, f] as const));

// Ключ списка-сущности из id узла-цели (block:<list> / block:<card>:<list> / item:<card>:<list>:<id>).
function listOfNode(nodeId: string): string | undefined {
  if (nodeId.startsWith('block:')) {
    const parts = nodeId.split(':');
    return parts.length > 2 ? parts[2] : parts[1];
  }
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
  { id: 'supportsChoice', label: 'поддерживает выбор', about: 'действие поддерживает выбранную альтернативу', color: '#16A34A' },
  { id: 'testsChoice', label: 'проверяет выбор', about: 'гипотеза проверяет выбранную альтернативу', color: '#CA8A04' },
  { id: 'symptomGap', label: 'проявление разрыва', about: 'симптом — проявление разрыва Теории и реальности', color: '#B45309' },
  { id: 'evidence', label: 'подтверждение фактом', about: 'факт подтверждает разрыв, симптом или суждение', color: '#0D9488' },
  { id: 'refute', label: 'опровержение', about: 'факт опровергает альтернативное объяснение', color: '#E11D48' },
  { id: 'checksTheory', label: 'проверка Теории', about: 'разрыв Диагноза проверяет блок Теории проекта', color: NEUTRAL_COLOR },
];
const FAMILY_LABEL = new Map(RELATION_FAMILIES.map(f => [f.id, f.label] as const));
const familyLabel = (id: string): string => FAMILY_LABEL.get(id) ?? id;

// === Типы графа (type-алиасы — чтобы data приводились к Record<string, unknown> для React Flow) ===
// Верхний «слой разделов»: карточка-раздел (ссылка на экран), из которой выходит корень раздела.
// Пока слой содержит один раздел — «Теория проекта»; позже сюда добавятся остальные экраны.
export type TheorySectionData = { kind: 'section'; cardId: string; title: string; subtitle: string };
export type TheoryMissionData = { kind: 'mission'; cardId: string; title: string; statement: string; isEmpty: boolean };
export type TheoryBlockData = {
  kind: 'block'; cardId: string; list: string; title: string; index: number; nameField: string; expandKey: string;
  itemCount: number; isEmpty: boolean; expanded: boolean; expandable: boolean; addable: boolean;
};
export type TheoryItemData = { kind: 'item'; cardId: string; list: string; itemId: string; label: string; blockTitle: string };

export type TheoryNode =
  | { id: string; type: 'sectionNode'; data: TheorySectionData }
  | { id: string; type: 'missionNode'; data: TheoryMissionData }
  | { id: string; type: 'blockNode'; data: TheoryBlockData }
  | { id: string; type: 'itemNode'; data: TheoryItemData };

export type TheoryEdgeKind = 'section' | 'sectionLink' | 'origin' | 'ref' | 'containment';
// family — подпись-семейство (по умолчанию на карте), verb — точный глагол (показываем по наведению).
export interface TheoryEdge { id: string; source: string; target: string; kind: TheoryEdgeKind; label?: string; family?: string; verb?: string; }
export interface TheoryGraph { nodes: TheoryNode[]; edges: TheoryEdge[]; }

// === id-хелперы ===
const blockNodeId = (cardId: string, list: string) => cardId === THEORY_CARD_ID ? `block:${list}` : `block:${cardId}:${list}`;
const itemNodeId = (cardId: string, list: string, itemId: string) => `item:${cardId}:${list}:${itemId}`;
const expandKey = (cardId: string, list: string) => cardId === THEORY_CARD_ID ? list : `${cardId}:${list}`;
const trimmed = (v?: string) => (v ?? '').trim();
const meaningful = (v?: string) => {
  const s = trimmed(v);
  return Boolean(s) && !s.toLowerCase().startsWith('сначала заполните');
};
const hasContent = (item: EditableItem, ignoredKeys: ReadonlySet<string> = new Set()) =>
  Object.entries(item.values).some(([k, v]) => !ignoredKeys.has(k) && meaningful(v));
const tokenize = (v?: string) => trimmed(v).split(/[;,]\s*/).map(t => t.trim().toLowerCase()).filter(Boolean);

function theoryCard(model: ProjectEditModel): EditableCard | undefined {
  return model.editable_cards.find(c => c.card_id === THEORY_CARD_ID);
}
function strategyCard(model: ProjectEditModel): EditableCard | undefined {
  return model.editable_cards.find(c => c.card_id === STRATEGY_CARD_ID);
}
function missionStatement(card: EditableCard | undefined): string {
  const fields = card?.fields ?? [];
  const get = (k: string) => trimmed(fields.find(f => f.key === k)?.value);
  return get('finalStatement') || get('victoryState') || get('problem') || '';
}
function missionFilled(card: EditableCard | undefined): boolean {
  return (card?.fields ?? []).some(f => trimmed(f.value));
}
function fieldsMap(card: EditableCard | undefined): Map<string, string> {
  return new Map((card?.fields ?? []).map(f => [f.key, f.value] as const));
}
function strategyStatement(card: EditableCard | undefined): string {
  const fields = fieldsMap(card);
  return trimmed(fields.get('acceptedChoice'))
    || trimmed(fields.get('guidingPolicy'))
    || trimmed(fields.get('strategicQuestion'))
    || trimmed(fields.get('winningAspiration'))
    || '';
}
// Корень Диагноза — итоговое диагностическое суждение (как Миссия для Теории).
function diagnosisStatement(card: EditableCard | undefined): string {
  const fields = fieldsMap(card);
  return trimmed(fields.get('finalStatement')) || trimmed(fields.get('keyChallenge')) || '';
}
// Имя-опция разрыва в редакторе Диагноза: «N. <блок Теории>» (так хранятся ссылки relatedGap/confirms).
const THEORY_BLOCK_TITLE = new Map<string, string>(PROJECT_THEORY_BLOCKS.map(b => [b.id, b.title]));
function gapName(index: number, theoryBlock?: string): string {
  const title = THEORY_BLOCK_TITLE.get(trimmed(theoryBlock)) || PROJECT_THEORY_BLOCKS[0].title;
  return `${index + 1}. ${title}`;
}
// Узел Теории, который проверяет разрыв (gap.theoryBlock): корень-Миссия или один из 6 блоков.
function theoryNodeForBlock(theoryBlock?: string): string | null {
  const id = trimmed(theoryBlock);
  if (!id) return null;
  if (id === 'mission') return MISSION_NODE_ID;
  return THEORY_BLOCKS.some(b => b.list === id) ? blockNodeId(THEORY_CARD_ID, id) : null;
}
function itemByLabel(items: EditableItem[]): Map<string, string> {
  const idx = new Map<string, string>();
  for (const it of items) {
    const lbl = it.label.trim().toLowerCase();
    if (lbl) idx.set(lbl, String(it.id));
  }
  return idx;
}
function resolveByRefOrLabel(value: string | undefined, refValue: string | undefined, targetCard: string, targetList: string, targetByLabel: Map<string, string>): string | null {
  const prefix = `${targetCard}:${targetList}:`;
  const ref = trimmed(refValue);
  if (ref.startsWith(prefix)) return ref.slice(prefix.length);
  for (const token of tokenize(value)) {
    const id = targetByLabel.get(token);
    if (id) return id;
  }
  return null;
}

export function buildTheoryGraph(projectId: number, expanded: ReadonlySet<string> = new Set(), model?: ProjectEditModel): TheoryGraph {
  const m = model ?? buildProjectEditModel(projectId);
  const card = theoryCard(m);
  const strategy = strategyCard(m);

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
    data: { kind: 'mission', cardId: THEORY_CARD_ID, title: 'Миссия проекта', statement: missionStatement(card), isEmpty: !missionFilled(card) },
  });

  // Содержательные элементы блоков + индекс лейблов (для резолва связей)
  const itemsByList = new Map<string, EditableItem[]>();
  const labelIndex = new Map<string, Map<string, string>>(); // list → (labelLC → itemId)
  for (const b of THEORY_BLOCKS) {
    const items = (card?.lists.find(l => l.list === b.list)?.items ?? []).filter(it => hasContent(it));
    itemsByList.set(b.list, items);
    labelIndex.set(b.list, itemByLabel(items));
  }

  // Блоки + элементы раскрытых блоков; запоминаем присутствующие узлы-элементы
  const presentItems = new Set<string>();
  THEORY_BLOCKS.forEach((b, index) => {
    const items = itemsByList.get(b.list) ?? [];
    nodes.push({
      id: blockNodeId(THEORY_CARD_ID, b.list), type: 'blockNode',
      data: {
        kind: 'block', cardId: THEORY_CARD_ID, list: b.list, title: b.title, index, nameField: b.nameField, expandKey: expandKey(THEORY_CARD_ID, b.list),
        itemCount: items.length, isEmpty: items.length === 0, expanded: expanded.has(b.list), expandable: items.length > 0, addable: true,
      },
    });
    // структурное ребро Миссия → блок (всегда видно)
    edges.push({ id: `origin:${b.list}`, source: MISSION_NODE_ID, target: blockNodeId(THEORY_CARD_ID, b.list), kind: 'origin' });

    if (expanded.has(b.list)) {
      for (const it of items) {
        const nid = itemNodeId(THEORY_CARD_ID, b.list, String(it.id));
        presentItems.add(nid);
        nodes.push({ id: nid, type: 'itemNode', data: { kind: 'item', cardId: THEORY_CARD_ID, list: b.list, itemId: String(it.id), label: it.label, blockTitle: b.title } });
        edges.push({ id: `containment:${nid}`, source: blockNodeId(THEORY_CARD_ID, b.list), target: nid, kind: 'containment' });
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
      const target = itemNodeId(THEORY_CARD_ID, link.targetList, id);
      if (!presentItems.has(target)) continue;
      edges.push({ id: `ref:m:${seq++}`, source: MISSION_NODE_ID, target, kind: 'ref', family: familyLabel(link.family), verb: link.verb });
    }
  }

  for (const link of BLOCK_LINKS) {
    const idx = labelIndex.get(link.targetList);
    if (!idx) continue;
    for (const src of itemsByList.get(link.sourceList) ?? []) {
      const source = itemNodeId(THEORY_CARD_ID, link.sourceList, String(src.id));
      if (!presentItems.has(source)) continue;
      for (const token of tokenize(src.values[link.field])) {
        const id = idx.get(token);
        if (!id) continue;
        const target = itemNodeId(THEORY_CARD_ID, link.targetList, id);
        if (target === source || !presentItems.has(target)) continue;
        edges.push({ id: `ref:b:${seq++}:${source}->${target}`, source, target, kind: 'ref', family: familyLabel(link.family), verb: link.verb });
      }
    }
  }

  // === Диагноз: проверяет блоки Теории через разрывы, симптомы и факты ===
  // Каркас (раздел → Диагностическое суждение → 6 блоков) строится всегда; смысловые связи —
  // из реальных полей-ссылок редактора Диагноза (relatedGap/confirmingFact/confirms/refutes),
  // плюс кросс-связь «разрыв → блок Теории» из поля gap.theoryBlock.
  const diagnosis = m.editable_cards.find(c => c.card_id === DIAGNOSIS_CARD_ID);
  nodes.push({
    id: DIAGNOSIS_SECTION_NODE_ID, type: 'sectionNode',
    data: { kind: 'section', cardId: DIAGNOSIS_CARD_ID, title: 'Диагноз', subtitle: 'Раздел проекта' },
  });
  edges.push({ id: 'section:diagnosis->root', source: DIAGNOSIS_SECTION_NODE_ID, target: DIAGNOSIS_ROOT_NODE_ID, kind: 'section', label: 'диагноз' });
  nodes.push({
    id: DIAGNOSIS_ROOT_NODE_ID, type: 'missionNode',
    data: { kind: 'mission', cardId: DIAGNOSIS_CARD_ID, title: 'Диагностическое суждение', statement: diagnosisStatement(diagnosis), isEmpty: !missionFilled(diagnosis) },
  });

  // Авто-засеянные поля не считаем «контентом» (иначе пустые засеянные разрывы засоряют граф).
  const diagnosisIgnored = new Map<string, ReadonlySet<string>>([
    ['gaps', new Set(['theoryBlock', 'expectedState', 'status'])],
    ['alternatives', new Set(['status'])],
  ]);
  const diagItemsByList = new Map<string, EditableItem[]>();
  const diagLabelIndex = new Map<string, Map<string, string>>(); // symptoms/facts — по их собственным лейблам
  for (const b of DIAGNOSIS_BLOCKS) {
    const items = (diagnosis?.lists.find(l => l.list === b.list)?.items ?? []).filter(it => hasContent(it, diagnosisIgnored.get(b.list)));
    diagItemsByList.set(b.list, items);
    diagLabelIndex.set(b.list, itemByLabel(items));
  }

  // Разрывы резолвятся по «имени-опции» редактора `${i+1}. <блок>` (нумерация — по позиции в полном
  // списке gaps, как в редакторе); в индекс кладём только присутствующие (раскрытые/непустые) разрывы.
  const allGaps = diagnosis?.lists.find(l => l.list === 'gaps')?.items ?? [];
  const presentGapIds = new Set((diagItemsByList.get('gaps') ?? []).map(it => String(it.id)));
  const gapByName = new Map<string, string>();
  allGaps.forEach((g, i) => {
    const id = String(g.id);
    if (presentGapIds.has(id)) gapByName.set(gapName(i, g.values.theoryBlock).toLowerCase(), id);
  });

  DIAGNOSIS_BLOCKS.forEach((b, index) => {
    const key = expandKey(DIAGNOSIS_CARD_ID, b.list);
    const items = diagItemsByList.get(b.list) ?? [];
    nodes.push({
      id: blockNodeId(DIAGNOSIS_CARD_ID, b.list), type: 'blockNode',
      data: {
        kind: 'block', cardId: DIAGNOSIS_CARD_ID, list: b.list, title: b.title, index, nameField: b.nameField, expandKey: key, addable: b.addable,
        itemCount: items.length, isEmpty: items.length === 0, expanded: expanded.has(key), expandable: items.length > 0,
      },
    });
    edges.push({ id: `origin:${DIAGNOSIS_CARD_ID}:${b.list}`, source: DIAGNOSIS_ROOT_NODE_ID, target: blockNodeId(DIAGNOSIS_CARD_ID, b.list), kind: 'origin' });

    if (expanded.has(key)) {
      for (const it of items) {
        const nid = itemNodeId(DIAGNOSIS_CARD_ID, b.list, String(it.id));
        presentItems.add(nid);
        nodes.push({ id: nid, type: 'itemNode', data: { kind: 'item', cardId: DIAGNOSIS_CARD_ID, list: b.list, itemId: String(it.id), label: it.label, blockTitle: b.title } });
        edges.push({ id: `containment:${nid}`, source: blockNodeId(DIAGNOSIS_CARD_ID, b.list), target: nid, kind: 'containment' });
      }
    }
  });

  const diagFactIdx = diagLabelIndex.get('facts') ?? new Map();
  const diagSymptomIdx = diagLabelIndex.get('symptoms') ?? new Map();
  const diagRef = (source: string, target: string, family: string, verb: string) =>
    edges.push({ id: `ref:d:${seq++}:${source}->${target}`, source, target, kind: 'ref', family: familyLabel(family), verb });

  // симптом → разрыв (relatedGap)
  for (const s of diagItemsByList.get('symptoms') ?? []) {
    const source = itemNodeId(DIAGNOSIS_CARD_ID, 'symptoms', String(s.id));
    if (!presentItems.has(source)) continue;
    for (const token of tokenize(s.values.relatedGap)) {
      const id = gapByName.get(token);
      if (!id) continue;
      const target = itemNodeId(DIAGNOSIS_CARD_ID, 'gaps', id);
      if (presentItems.has(target)) diagRef(source, target, 'symptomGap', 'проявляется в разрыве');
    }
  }

  // разрыв → факт (confirmingFact)
  for (const g of diagItemsByList.get('gaps') ?? []) {
    const source = itemNodeId(DIAGNOSIS_CARD_ID, 'gaps', String(g.id));
    if (!presentItems.has(source)) continue;
    for (const token of tokenize(g.values.confirmingFact)) {
      const id = diagFactIdx.get(token);
      if (!id) continue;
      const target = itemNodeId(DIAGNOSIS_CARD_ID, 'facts', id);
      if (presentItems.has(target)) diagRef(source, target, 'evidence', 'подтверждается фактом');
    }
  }

  // факт → симптом / разрыв / диагностическое суждение (confirms)
  for (const f of diagItemsByList.get('facts') ?? []) {
    const source = itemNodeId(DIAGNOSIS_CARD_ID, 'facts', String(f.id));
    if (!presentItems.has(source)) continue;
    for (const token of tokenize(f.values.confirms)) {
      if (token === 'диагностическое суждение') { diagRef(source, DIAGNOSIS_ROOT_NODE_ID, 'evidence', 'подтверждает суждение'); continue; }
      const sid = diagSymptomIdx.get(token);
      if (sid) {
        const target = itemNodeId(DIAGNOSIS_CARD_ID, 'symptoms', sid);
        if (presentItems.has(target)) diagRef(source, target, 'evidence', 'подтверждает симптом');
        continue;
      }
      const gid = gapByName.get(token);
      if (gid) {
        const target = itemNodeId(DIAGNOSIS_CARD_ID, 'gaps', gid);
        if (presentItems.has(target)) diagRef(source, target, 'evidence', 'подтверждает разрыв');
      }
    }
  }

  // альтернативное объяснение → факт (confirms / refutes)
  for (const a of diagItemsByList.get('alternatives') ?? []) {
    const source = itemNodeId(DIAGNOSIS_CARD_ID, 'alternatives', String(a.id));
    if (!presentItems.has(source)) continue;
    for (const token of tokenize(a.values.confirms)) {
      const id = diagFactIdx.get(token);
      if (!id) continue;
      const target = itemNodeId(DIAGNOSIS_CARD_ID, 'facts', id);
      if (presentItems.has(target)) diagRef(source, target, 'evidence', 'подтверждается');
    }
    for (const token of tokenize(a.values.refutes)) {
      const id = diagFactIdx.get(token);
      if (!id) continue;
      const target = itemNodeId(DIAGNOSIS_CARD_ID, 'facts', id);
      if (presentItems.has(target)) diagRef(source, target, 'refute', 'опровергается');
    }
  }

  // кросс-связь: разрыв → блок Теории, который он проверяет (gap.theoryBlock)
  for (const g of diagItemsByList.get('gaps') ?? []) {
    const source = itemNodeId(DIAGNOSIS_CARD_ID, 'gaps', String(g.id));
    if (!presentItems.has(source)) continue;
    const theoryNode = theoryNodeForBlock(g.values.theoryBlock);
    if (theoryNode) diagRef(source, theoryNode, 'checksTheory', 'проверяет блок Теории');
  }

  // Стратегический выбор: отдельный раздел рядом с Теорией. Каркас строится всегда,
  // смысловые связи — только из реальных полей связи самого экрана.
  nodes.push({
    id: STRATEGY_SECTION_NODE_ID, type: 'sectionNode',
    data: { kind: 'section', cardId: STRATEGY_CARD_ID, title: 'Стратегический выбор', subtitle: 'Раздел проекта' },
  });
  edges.push({ id: 'section:strategy->root', source: STRATEGY_SECTION_NODE_ID, target: STRATEGY_ROOT_NODE_ID, kind: 'section', label: 'выбор' });

  for (const link of SECTION_LINKS) {
    edges.push({ id: `section-link:${link.source}->${link.target}`, source: link.source, target: link.target, kind: 'sectionLink', label: link.label });
  }

  nodes.push({
    id: STRATEGY_ROOT_NODE_ID, type: 'missionNode',
    data: { kind: 'mission', cardId: STRATEGY_CARD_ID, title: 'Принятый стратегический выбор', statement: strategyStatement(strategy), isEmpty: !missionFilled(strategy) },
  });

  const strategyIgnored = new Map<string, ReadonlySet<string>>([
    ['alternatives', new Set(['status'])],
  ]);
  const strategyItemsByList = new Map<string, EditableItem[]>();
  const strategyLabelIndex = new Map<string, Map<string, string>>();
  for (const b of STRATEGY_BLOCKS) {
    const items = (strategy?.lists.find(l => l.list === b.list)?.items ?? []).filter(it => hasContent(it, strategyIgnored.get(b.list)));
    strategyItemsByList.set(b.list, items);
    strategyLabelIndex.set(b.list, itemByLabel(items));
  }

  STRATEGY_BLOCKS.forEach((b, index) => {
    const key = expandKey(STRATEGY_CARD_ID, b.list);
    const items = strategyItemsByList.get(b.list) ?? [];
    nodes.push({
      id: blockNodeId(STRATEGY_CARD_ID, b.list), type: 'blockNode',
      data: {
        kind: 'block', cardId: STRATEGY_CARD_ID, list: b.list, title: b.title, index, nameField: b.nameField, expandKey: key,
        itemCount: items.length, isEmpty: items.length === 0, expanded: expanded.has(key), expandable: items.length > 0, addable: true,
      },
    });
    edges.push({ id: `origin:${STRATEGY_CARD_ID}:${b.list}`, source: STRATEGY_ROOT_NODE_ID, target: blockNodeId(STRATEGY_CARD_ID, b.list), kind: 'origin' });

    if (expanded.has(key)) {
      for (const it of items) {
        const nid = itemNodeId(STRATEGY_CARD_ID, b.list, String(it.id));
        presentItems.add(nid);
        nodes.push({ id: nid, type: 'itemNode', data: { kind: 'item', cardId: STRATEGY_CARD_ID, list: b.list, itemId: String(it.id), label: it.label, blockTitle: b.title } });
        edges.push({ id: `containment:${nid}`, source: blockNodeId(STRATEGY_CARD_ID, b.list), target: nid, kind: 'containment' });
      }
    }
  });

  const strategyFields = fieldsMap(strategy);
  const alternativeIdx = strategyLabelIndex.get('alternatives') ?? new Map();
  const selectedAlternative = resolveByRefOrLabel(strategyFields.get('selectedAlternative'), undefined, STRATEGY_CARD_ID, 'alternatives', alternativeIdx);
  if (selectedAlternative) {
    const target = itemNodeId(STRATEGY_CARD_ID, 'alternatives', selectedAlternative);
    if (presentItems.has(target)) {
      edges.push({ id: `ref:s:${seq++}:selected`, source: STRATEGY_ROOT_NODE_ID, target, kind: 'ref', family: familyLabel('defines'), verb: 'выбрана' });
    }
  }

  for (const action of strategyItemsByList.get('actions') ?? []) {
    const source = itemNodeId(STRATEGY_CARD_ID, 'actions', String(action.id));
    if (!presentItems.has(source)) continue;
    const targetId = resolveByRefOrLabel(action.values.supportsChoice, action.values.supportsChoiceRef, STRATEGY_CARD_ID, 'alternatives', alternativeIdx);
    if (!targetId) continue;
    const target = itemNodeId(STRATEGY_CARD_ID, 'alternatives', targetId);
    if (!presentItems.has(target)) continue;
    edges.push({ id: `ref:s:${seq++}:${source}->${target}`, source, target, kind: 'ref', family: familyLabel('supportsChoice'), verb: 'поддерживает' });
  }

  const competencyIdx = labelIndex.get('competencies') ?? new Map();
  for (const capability of strategyItemsByList.get('capabilities') ?? []) {
    const source = itemNodeId(STRATEGY_CARD_ID, 'capabilities', String(capability.id));
    if (!presentItems.has(source)) continue;
    for (const token of tokenize(capability.values.competency)) {
      const targetId = competencyIdx.get(token);
      if (!targetId) continue;
      const target = itemNodeId(THEORY_CARD_ID, 'competencies', targetId);
      if (!presentItems.has(target)) continue;
      edges.push({ id: `ref:s:${seq++}:${source}->${target}`, source, target, kind: 'ref', family: familyLabel('needsCapability'), verb: 'требует' });
    }
  }

  for (const hypothesis of strategyItemsByList.get('hypotheses') ?? []) {
    const source = itemNodeId(STRATEGY_CARD_ID, 'hypotheses', String(hypothesis.id));
    if (!presentItems.has(source)) continue;
    const targetId = resolveByRefOrLabel(hypothesis.values.choiceLink, hypothesis.values.choiceLinkRef, STRATEGY_CARD_ID, 'alternatives', alternativeIdx);
    if (!targetId) continue;
    const target = itemNodeId(STRATEGY_CARD_ID, 'alternatives', targetId);
    if (!presentItems.has(target)) continue;
    edges.push({ id: `ref:s:${seq++}:${source}->${target}`, source, target, kind: 'ref', family: familyLabel('testsChoice'), verb: 'влияет на' });
  }

  return { nodes, edges };
}
