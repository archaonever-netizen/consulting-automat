// Модель графа «Весь проект» (гибрид: дерево фаз + общие кластеры сущностей).
// Чистая функция buildProjectGraph(projectId, expanded) собирает узлы и рёбра:
//   - группы фаз методологии (Замысел → Логика → Измерение → Исполнение → Обучение);
//   - карточки (13) внутри групп, связь-спина с подписями;
//   - кластеры повторяющихся сущностей (Стейкхолдеры, Результаты…) — агрегируют элементы из
//     разных карточек (дедупликация), карточки ссылаются на кластеры;
//   - элементы раскрытых карточек (НЕкластеризованные списки) и раскрытых кластеров;
//   - надёжные связи: ref-поля Теории (по совпадению меток) и иерархия OKR;
//   - разрывы (gaps).
// UI/раскладки здесь нет — только данные.
import { buildCardValidationText } from './projectCardValidation';
import { buildProjectEditModel, type EditableCard, type EditableItem } from './projectEditModel';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';
import { PROJECT_CLUSTERS, isClusteredList, type ClusterSpec } from './projectGraphClusters';

const WHOLE_PROJECT_ID = 'whole-project';

const HEADLINE_KEYS = [
  'finalStatement', 'statement', 'keyChallenge', 'winningAspiration',
  'acceptedChoice', 'guidingPolicy', 'objective',
];

const OKR_SYNTHETIC_KEYS = new Set(['objectiveRef', 'source', 'level']);

// Фазовые группы — родительский уровень дерева.
export interface PhaseGroup { id: string; title: string; cardIds: string[]; }
export const PHASE_GROUPS: PhaseGroup[] = [
  { id: 'intent', title: 'Замысел', cardIds: ['project-theory', 'diagnosis', 'strategic-choice', 'target-state'] },
  { id: 'logic', title: 'Причинно-следственная логика', cardIds: ['strategy-map', 'hypotheses', 'experiments', 'decisions'] },
  { id: 'measure', title: 'Цели и измерение', cardIds: ['okr-kpi'] },
  { id: 'execute', title: 'Исполнение', cardIds: ['initiatives', 'business-processes', 'tasks'] },
  { id: 'learn', title: 'Обучение', cardIds: ['facts-learning'] },
];
const GROUP_OF_CARD = new Map(PHASE_GROUPS.flatMap((g, gi) => g.cardIds.map((c, ci) => [c, { gi, ci, groupId: g.id }])));

// Связи карточка→карточка (каркас методологии) + одна дуга обратной связи.
interface BackboneEdge { source: string; target: string; label: string; feedback?: boolean; }
export const BACKBONE_EDGES: BackboneEdge[] = [
  { source: 'project-theory', target: 'diagnosis', label: 'проверяется' },
  { source: 'diagnosis', target: 'strategic-choice', label: 'обосновывает' },
  { source: 'strategic-choice', target: 'target-state', label: 'задаёт' },
  { source: 'target-state', target: 'strategy-map', label: 'раскладывается' },
  { source: 'strategy-map', target: 'hypotheses', label: 'опирается на' },
  { source: 'hypotheses', target: 'experiments', label: 'проверяются' },
  { source: 'experiments', target: 'decisions', label: 'дают факты для' },
  { source: 'decisions', target: 'okr-kpi', label: 'переводятся в' },
  { source: 'okr-kpi', target: 'initiatives', label: 'реализуются через' },
  { source: 'initiatives', target: 'business-processes', label: 'закрепляются в' },
  { source: 'business-processes', target: 'tasks', label: 'дробятся на' },
  { source: 'tasks', target: 'facts-learning', label: 'дают факты' },
  { source: 'facts-learning', target: 'project-theory', label: 'обновляет модель', feedback: true },
];

// Надёжные ref-связи внутри Теории (Теория хранит ссылки как разрешённые ЛЕЙБЛЫ — матчим по метке).
interface TheoryRef { sourceList: string; field: string; targetList: string; label: string; }
const THEORY_REFS: TheoryRef[] = [
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

// === Типы графа ===

// type-алиасы (не interface): чтобы data-объекты приводились к Record<string, unknown> для React Flow.
export type GraphGroupData = { kind: 'group'; groupId: string; title: string; cardCount: number };
export type GraphCardData = {
  kind: 'card'; cardId: string; title: string; headline: string;
  itemCount: number; isEmpty: boolean; gapCount: number;
  expanded: boolean; expandable: boolean;
  groupId: string; groupIndex: number; indexInGroup: number;
  column: number; // глобальная позиция в порядке методологии (для раскладки и фон-полос групп)
};
export type GraphClusterData = {
  kind: 'cluster'; clusterId: string; title: string;
  itemCount: number; isEmpty: boolean; expanded: boolean; expandable: boolean;
  sourceCardIds: string[]; index: number;
};
export type GraphItemData = {
  kind: 'item'; cardId: string; list: string; itemId: string;
  label: string; subtitle: string; hasGap: boolean; clusterId: string | null;
};

export type GraphNode =
  | { id: string; type: 'groupNode'; data: GraphGroupData }
  | { id: string; type: 'cardNode'; data: GraphCardData }
  | { id: string; type: 'clusterNode'; data: GraphClusterData }
  | { id: string; type: 'itemNode'; data: GraphItemData };

export type GraphEdgeKind = 'backbone' | 'feedback' | 'cluster' | 'containment' | 'hierarchy' | 'ref';

export interface GraphEdge {
  id: string; source: string; target: string; kind: GraphEdgeKind; label?: string;
}

export interface GraphGap { id: string; cardId: string; nodeId: string; message: string; }

export interface ProjectGraph { nodes: GraphNode[]; edges: GraphEdge[]; gaps: GraphGap[]; }

// === id-хелперы ===
const groupNodeId = (g: string) => `group:${g}`;
const cardNodeId = (c: string) => `card:${c}`;
const clusterNodeId = (c: string) => `cluster:${c}`;
const itemNodeId = (cardId: string, list: string, itemId: string) => `item:${cardId}:${list}:${itemId}`;
const trimmed = (v: string | undefined) => (v ?? '').trim();

function itemHasContent(cardId: string, item: EditableItem): boolean {
  return Object.entries(item.values).some(([key, value]) =>
    trimmed(value) && !(cardId === 'okr-kpi' && OKR_SYNTHETIC_KEYS.has(key)));
}
const contentItems = (cardId: string, items: EditableItem[]) => items.filter(i => itemHasContent(cardId, i));

function cardHeadline(card: EditableCard | undefined): string {
  if (!card?.fields) return '';
  for (const key of HEADLINE_KEYS) {
    const hit = card.fields.find(f => f.key === key && trimmed(f.value));
    if (hit) return trimmed(hit.value);
  }
  return '';
}
const listById = (card: EditableCard | undefined, list: string) => card?.lists.find(l => l.list === list);

// === Разрывы (как раньше) ===
interface GapContext { filled: (cardId: string) => boolean; anyContent: () => boolean; }
interface CardGapRule { id: string; cardId: string; message: string; when: (ctx: GapContext) => boolean; }
const CARD_GAP_RULES: CardGapRule[] = [
  { id: 'hyp-no-exp', cardId: 'hypotheses', message: 'Гипотезы без проверок', when: c => c.filled('hypotheses') && !c.filled('experiments') },
  { id: 'exp-no-dec', cardId: 'experiments', message: 'Проверки без решений', when: c => c.filled('experiments') && !c.filled('decisions') },
  { id: 'okr-no-choice', cardId: 'okr-kpi', message: 'OKR не опирается на стратегический выбор', when: c => c.filled('okr-kpi') && !c.filled('strategic-choice') },
  { id: 'init-no-tasks', cardId: 'initiatives', message: 'Инициативы без задач', when: c => c.filled('initiatives') && !c.filled('tasks') },
  { id: 'choice-no-diag', cardId: 'strategic-choice', message: 'Стратегический выбор без диагноза', when: c => c.filled('strategic-choice') && !c.filled('diagnosis') },
  { id: 'no-feedback', cardId: 'facts-learning', message: 'Обратная связь не замкнута', when: c => c.anyContent() && !c.filled('facts-learning') },
];

function collectElementGaps(byId: Map<string, EditableCard>): GraphGap[] {
  const gaps: GraphGap[] = [];
  const okr = byId.get('okr-kpi');
  if (okr) {
    const objectives = contentItems('okr-kpi', listById(okr, 'objectives')?.items ?? []);
    const keyResults = contentItems('okr-kpi', listById(okr, 'keyResults')?.items ?? []);
    for (const obj of objectives) {
      if (!keyResults.some(kr => String(kr.id).split(':')[0] === String(obj.id))) {
        gaps.push({ id: `okr-obj-no-kr:${obj.id}`, cardId: 'okr-kpi', nodeId: itemNodeId('okr-kpi', 'objectives', String(obj.id)), message: 'Objective без key results' });
      }
    }
  }
  const choice = byId.get('strategic-choice');
  const hyps = contentItems('strategic-choice', listById(choice, 'hypotheses')?.items ?? []);
  for (const h of hyps) {
    if (!trimmed(h.values.assumption) || !trimmed(h.values.choiceLink)) {
      gaps.push({ id: `choice-hyp-incomplete:${h.id}`, cardId: 'strategic-choice', nodeId: itemNodeId('strategic-choice', 'hypotheses', String(h.id)), message: 'Гипотеза без предположения или связи с выбором' });
    }
  }
  return gaps;
}

// Надёжные ref-связи Теории: матчим значение поля (метку) с меткой целевого элемента.
function collectTheoryRefEdges(theory: EditableCard | undefined): GraphEdge[] {
  if (!theory) return [];
  const edges: GraphEdge[] = [];
  const byLabel = (list: string) => {
    const map = new Map<string, EditableItem>();
    for (const it of contentItems('project-theory', listById(theory, list)?.items ?? [])) {
      map.set(it.label.trim().toLowerCase(), it);
    }
    return map;
  };
  const targetMaps = new Map<string, Map<string, EditableItem>>();
  for (const ref of THEORY_REFS) if (!targetMaps.has(ref.targetList)) targetMaps.set(ref.targetList, byLabel(ref.targetList));

  for (const ref of THEORY_REFS) {
    const sources = contentItems('project-theory', listById(theory, ref.sourceList)?.items ?? []);
    const targets = targetMaps.get(ref.targetList)!;
    for (const src of sources) {
      const raw = trimmed(src.values[ref.field]);
      if (!raw) continue;
      for (const token of raw.split(/[;,]\s*/).map(t => t.trim()).filter(Boolean)) {
        const tgt = targets.get(token.toLowerCase());
        if (!tgt || (ref.sourceList === ref.targetList && String(tgt.id) === String(src.id))) continue;
        const s = itemNodeId('project-theory', ref.sourceList, String(src.id));
        const t = itemNodeId('project-theory', ref.targetList, String(tgt.id));
        edges.push({ id: `ref:${s}->${t}:${ref.field}`, source: s, target: t, kind: 'ref', label: ref.label });
      }
    }
  }
  return edges;
}

// === Сборка ===
export function buildProjectGraph(projectId: number, expanded: ReadonlySet<string> = new Set()): ProjectGraph {
  const model = buildProjectEditModel(projectId);
  const byId = new Map(model.editable_cards.map(c => [c.card_id, c]));
  const cards = PROJECT_FRAMEWORK_CARDS.filter(c => c.id !== WHOLE_PROJECT_ID);

  const filledMap = new Map<string, boolean>();
  const nonClusteredCount = new Map<string, number>();
  for (const card of cards) {
    filledMap.set(card.id, buildCardValidationText(projectId, card.id).trim().length > 0);
    const editable = byId.get(card.id);
    const count = editable
      ? editable.lists.filter(l => !isClusteredList(card.id, l.list)).reduce((s, l) => s + contentItems(card.id, l.items).length, 0)
      : 0;
    nonClusteredCount.set(card.id, count);
  }

  const ctx: GapContext = {
    filled: id => filledMap.get(id) ?? false,
    anyContent: () => cards.some(c => c.id !== 'facts-learning' && (filledMap.get(c.id) ?? false)),
  };

  // Разрывы
  const gaps: GraphGap[] = [];
  for (const rule of CARD_GAP_RULES) if (rule.when(ctx)) gaps.push({ id: rule.id, cardId: rule.cardId, nodeId: cardNodeId(rule.cardId), message: rule.message });
  gaps.push(...collectElementGaps(byId));
  const gapCountByCard = new Map<string, number>();
  const gapNodeIds = new Set<string>();
  for (const g of gaps) { gapCountByCard.set(g.cardId, (gapCountByCard.get(g.cardId) ?? 0) + 1); gapNodeIds.add(g.nodeId); }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Группы
  for (const g of PHASE_GROUPS) nodes.push({ id: groupNodeId(g.id), type: 'groupNode', data: { kind: 'group', groupId: g.id, title: g.title, cardCount: g.cardIds.length } });

  // Карточки
  cards.forEach((card, column) => {
    const pos = GROUP_OF_CARD.get(card.id) ?? { gi: 0, ci: 0, groupId: 'intent' };
    const count = nonClusteredCount.get(card.id) ?? 0;
    nodes.push({
      id: cardNodeId(card.id), type: 'cardNode',
      data: {
        kind: 'card', cardId: card.id, title: card.title, headline: cardHeadline(byId.get(card.id)),
        itemCount: count, isEmpty: !(filledMap.get(card.id) ?? false), gapCount: gapCountByCard.get(card.id) ?? 0,
        expanded: expanded.has(card.id), expandable: count > 0,
        groupId: pos.groupId, groupIndex: pos.gi, indexInGroup: pos.ci, column,
      },
    });
  });

  // Каркасные рёбра
  for (const { source, target, label, feedback } of BACKBONE_EDGES) {
    edges.push({ id: `${feedback ? 'feedback' : 'backbone'}:${source}->${target}`, source: cardNodeId(source), target: cardNodeId(target), kind: feedback ? 'feedback' : 'backbone', label });
  }

  // Кластеры + рёбра карточка→кластер
  const clusterMembers = (spec: ClusterSpec) =>
    spec.sources.flatMap(s => contentItems(s.cardId, listById(byId.get(s.cardId), s.list)?.items ?? []).map(item => ({ ...s, item })));
  PROJECT_CLUSTERS.forEach((spec, index) => {
    const members = clusterMembers(spec);
    const sourceCardIds = [...new Set(members.map(m => m.cardId))];
    nodes.push({
      id: clusterNodeId(spec.id), type: 'clusterNode',
      data: { kind: 'cluster', clusterId: spec.id, title: spec.title, itemCount: members.length, isEmpty: members.length === 0, expanded: expanded.has(spec.id), expandable: members.length > 0, sourceCardIds, index },
    });
    for (const cardId of sourceCardIds) edges.push({ id: `cluster:${cardId}->${spec.id}`, source: cardNodeId(cardId), target: clusterNodeId(spec.id), kind: 'cluster' });

    // Элементы раскрытого кластера
    if (expanded.has(spec.id)) {
      for (const m of members) {
        const nodeId = itemNodeId(m.cardId, m.list, String(m.item.id));
        nodes.push({ id: nodeId, type: 'itemNode', data: { kind: 'item', cardId: m.cardId, list: m.list, itemId: String(m.item.id), label: m.item.label, subtitle: cardTitle(m.cardId), hasGap: gapNodeIds.has(nodeId), clusterId: spec.id } });
        edges.push({ id: `containment:${spec.id}->${nodeId}`, source: clusterNodeId(spec.id), target: nodeId, kind: 'containment' });
      }
    }
  });

  // Элементы раскрытых карточек (только НЕкластеризованные списки) + иерархия OKR
  for (const card of cards) {
    if (!expanded.has(card.id)) continue;
    const editable = byId.get(card.id);
    if (!editable) continue;
    const objectiveIds = card.id === 'okr-kpi'
      ? new Set(contentItems('okr-kpi', listById(editable, 'objectives')?.items ?? []).map(o => String(o.id)))
      : null;
    for (const list of editable.lists) {
      if (isClusteredList(card.id, list.list)) continue;
      for (const item of list.items) {
        if (!itemHasContent(card.id, item)) continue;
        const nodeId = itemNodeId(card.id, list.list, String(item.id));
        nodes.push({ id: nodeId, type: 'itemNode', data: { kind: 'item', cardId: card.id, list: list.list, itemId: String(item.id), label: item.label, subtitle: list.title, hasGap: gapNodeIds.has(nodeId), clusterId: null } });
        const parentObjId = objectiveIds && (list.list === 'keyResults' || list.list === 'kpis') ? String(item.id).split(':')[0] : null;
        if (parentObjId && objectiveIds?.has(parentObjId)) {
          const parent = itemNodeId('okr-kpi', 'objectives', parentObjId);
          edges.push({ id: `hierarchy:${parent}->${nodeId}`, source: parent, target: nodeId, kind: 'hierarchy' });
        } else {
          edges.push({ id: `containment:card:${nodeId}`, source: cardNodeId(card.id), target: nodeId, kind: 'containment' });
        }
      }
    }
  }

  // Надёжные ref-связи Теории (показываются компонентом, когда оба конца видимы)
  edges.push(...collectTheoryRefEdges(byId.get('project-theory')));

  return { nodes, edges, gaps };
}

function cardTitle(cardId: string): string {
  return PROJECT_FRAMEWORK_CARDS.find(c => c.id === cardId)?.title ?? cardId;
}
