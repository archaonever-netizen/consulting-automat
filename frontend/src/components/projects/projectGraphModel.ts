// Модель графа зависимостей проекта для экрана «Весь проект».
// Чистая функция buildProjectGraph(projectId, expanded) собирает:
//   - узлы-карточки (13 каркасных карточек, кроме whole-project);
//   - узлы-элементы раскрытых карточек (из buildProjectEditModel);
//   - рёбра-каркас методологии (BACKBONE_EDGES) + структурные рёбра элементов;
//   - разрывы (gaps) — карточные и элементные.
// Никакого UI/раскладки здесь нет — только данные, поэтому модуль легко тестируется.
import { buildCardValidationText } from './projectCardValidation';
import { buildProjectEditModel, type EditableCard, type EditableItem } from './projectEditModel';
import { PROJECT_FRAMEWORK_CARDS } from './projectFrameworkCards';

const WHOLE_PROJECT_ID = 'whole-project';

// Скаляры-кандидаты на заголовок узла-карточки (первый непустой выигрывает).
const HEADLINE_KEYS = [
  'finalStatement', 'statement', 'keyChallenge', 'winningAspiration',
  'acceptedChoice', 'guidingPolicy', 'objective',
];

// Синтетические/дефолтные ключи элементов OKR: адаптер впрыскивает objectiveRef в каждый
// KR/KPI, а createObjective сидирует source/level — по ним нельзя судить о наличии контента.
const OKR_SYNTHETIC_KEYS = new Set(['objectiveRef', 'source', 'level']);

// Зависимости карточка→карточка (каркас методологии). Линейная спина из соседних шагов
// (раскладывается в одну прямую) + одна дуга обратной связи. label поясняет смысл связи.
interface BackboneEdge {
  source: string;
  target: string;
  label: string;
  feedback?: boolean;
}
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

export type GraphNodeKind = 'card' | 'item';

export interface GraphCardData {
  kind: 'card';
  cardId: string;
  title: string;
  headline: string;
  itemCount: number;
  isEmpty: boolean;
  gapCount: number;
  expanded: boolean;
  expandable: boolean;
  column: number;   // позиция в линейной спине (для ровной горизонтальной раскладки)
}

export interface GraphItemData {
  kind: 'item';
  cardId: string;
  list: string;
  label: string;
  subtitle: string;
  hasGap: boolean;
}

export type GraphNode =
  | { id: string; type: 'cardNode'; data: GraphCardData }
  | { id: string; type: 'itemNode'; data: GraphItemData };

export type GraphEdgeKind = 'backbone' | 'feedback' | 'containment' | 'hierarchy';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  label?: string;
}

export interface GraphGap {
  id: string;
  cardId: string;   // карточка-владелец (для бейджа на узле-карточке)
  nodeId: string;   // узел для подсветки (карточка или конкретный элемент)
  message: string;
}

export interface ProjectGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  gaps: GraphGap[];
}

const cardNodeId = (cardId: string) => `card:${cardId}`;
const itemNodeId = (cardId: string, list: string, itemId: string) => `item:${cardId}:${list}:${itemId}`;
const trimmed = (v: string | undefined) => (v ?? '').trim();

// Элемент содержателен, если есть хотя бы одно непустое НЕсинтетическое значение. У OKR
// игнорируем objectiveRef/source/level — иначе пустые заготовки выглядят заполненными.
function itemHasContent(cardId: string, item: EditableItem): boolean {
  return Object.entries(item.values).some(([key, value]) =>
    trimmed(value) && !(cardId === 'okr-kpi' && OKR_SYNTHETIC_KEYS.has(key)));
}

function contentItems(cardId: string, items: EditableItem[]): EditableItem[] {
  return items.filter(item => itemHasContent(cardId, item));
}

function cardHeadline(card: EditableCard | undefined): string {
  if (!card?.fields) return '';
  for (const key of HEADLINE_KEYS) {
    const hit = card.fields.find(f => f.key === key && trimmed(f.value));
    if (hit) return trimmed(hit.value);
  }
  return '';
}

function listById(card: EditableCard | undefined, list: string) {
  return card?.lists.find(l => l.list === list);
}

// === Разрывы ===

interface GapContext {
  filled: (cardId: string) => boolean;
  anyContent: () => boolean;
}

interface CardGapRule {
  id: string;
  cardId: string;
  message: string;
  when: (ctx: GapContext) => boolean;
}

const CARD_GAP_RULES: CardGapRule[] = [
  { id: 'hyp-no-exp', cardId: 'hypotheses', message: 'Гипотезы без проверок', when: c => c.filled('hypotheses') && !c.filled('experiments') },
  { id: 'exp-no-dec', cardId: 'experiments', message: 'Проверки без решений', when: c => c.filled('experiments') && !c.filled('decisions') },
  { id: 'okr-no-choice', cardId: 'okr-kpi', message: 'OKR не опирается на стратегический выбор', when: c => c.filled('okr-kpi') && !c.filled('strategic-choice') },
  { id: 'init-no-tasks', cardId: 'initiatives', message: 'Инициативы без задач', when: c => c.filled('initiatives') && !c.filled('tasks') },
  { id: 'choice-no-diag', cardId: 'strategic-choice', message: 'Стратегический выбор без диагноза', when: c => c.filled('strategic-choice') && !c.filled('diagnosis') },
  { id: 'no-feedback', cardId: 'facts-learning', message: 'Обратная связь не замкнута', when: c => c.anyContent() && !c.filled('facts-learning') },
];

// Элементные разрывы: проверяемы внутри одного элемента, без кросс-id сопоставления.
function collectElementGaps(byId: Map<string, EditableCard>): GraphGap[] {
  const gaps: GraphGap[] = [];

  // OKR: objective без единого (содержательного) key result.
  const okr = byId.get('okr-kpi');
  if (okr) {
    const objectives = contentItems('okr-kpi', listById(okr, 'objectives')?.items ?? []);
    const keyResults = contentItems('okr-kpi', listById(okr, 'keyResults')?.items ?? []);
    for (const obj of objectives) {
      const hasKr = keyResults.some(kr => String(kr.id).split(':')[0] === String(obj.id));
      if (!hasKr) {
        gaps.push({
          id: `okr-obj-no-kr:${obj.id}`,
          cardId: 'okr-kpi',
          nodeId: itemNodeId('okr-kpi', 'objectives', String(obj.id)),
          message: 'Objective без key results',
        });
      }
    }
  }

  // Стратвыбор: гипотеза без предположения или связи с выбором.
  const choice = byId.get('strategic-choice');
  const hyps = contentItems('strategic-choice', listById(choice, 'hypotheses')?.items ?? []);
  for (const h of hyps) {
    if (!trimmed(h.values.assumption) || !trimmed(h.values.choiceLink)) {
      gaps.push({
        id: `choice-hyp-incomplete:${h.id}`,
        cardId: 'strategic-choice',
        nodeId: itemNodeId('strategic-choice', 'hypotheses', String(h.id)),
        message: 'Гипотеза без предположения или связи с выбором',
      });
    }
  }

  return gaps;
}

// === Сборка графа ===

export function buildProjectGraph(projectId: number, expanded: ReadonlySet<string> = new Set()): ProjectGraph {
  const model = buildProjectEditModel(projectId);
  const byId = new Map(model.editable_cards.map(c => [c.card_id, c]));

  const cards = PROJECT_FRAMEWORK_CARDS.filter(c => c.id !== WHOLE_PROJECT_ID);
  const filledMap = new Map<string, boolean>();
  const countMap = new Map<string, number>();
  for (const card of cards) {
    // «Заполнено» — по тому же сериализатору, что у текущего экрана: пусто ⇒ карточка пустая.
    filledMap.set(card.id, buildCardValidationText(projectId, card.id).trim().length > 0);
    const editable = byId.get(card.id);
    const count = editable ? editable.lists.reduce((sum, l) => sum + contentItems(card.id, l.items).length, 0) : 0;
    countMap.set(card.id, count);
  }

  const ctx: GapContext = {
    filled: id => filledMap.get(id) ?? false,
    anyContent: () => cards.some(c => c.id !== 'facts-learning' && (filledMap.get(c.id) ?? false)),
  };

  // Разрывы
  const gaps: GraphGap[] = [];
  for (const rule of CARD_GAP_RULES) {
    if (rule.when(ctx)) {
      gaps.push({ id: rule.id, cardId: rule.cardId, nodeId: cardNodeId(rule.cardId), message: rule.message });
    }
  }
  gaps.push(...collectElementGaps(byId));

  const gapCountByCard = new Map<string, number>();
  const gapNodeIds = new Set<string>();
  for (const g of gaps) {
    gapCountByCard.set(g.cardId, (gapCountByCard.get(g.cardId) ?? 0) + 1);
    gapNodeIds.add(g.nodeId);
  }

  // Узлы-карточки
  const nodes: GraphNode[] = cards.map((card, column) => {
    const editable = byId.get(card.id);
    const itemCount = countMap.get(card.id) ?? 0;
    return {
      id: cardNodeId(card.id),
      type: 'cardNode',
      data: {
        kind: 'card',
        cardId: card.id,
        title: card.title,
        headline: cardHeadline(editable),
        itemCount,
        isEmpty: !(filledMap.get(card.id) ?? false),
        gapCount: gapCountByCard.get(card.id) ?? 0,
        expanded: expanded.has(card.id),
        expandable: itemCount > 0,
        column,
      },
    };
  });

  // Рёбра-каркас
  const edges: GraphEdge[] = BACKBONE_EDGES.map(({ source, target, label, feedback }) => ({
    id: `${feedback ? 'feedback' : 'backbone'}:${source}->${target}`,
    source: cardNodeId(source),
    target: cardNodeId(target),
    kind: feedback ? 'feedback' : 'backbone',
    label,
  }));

  // Узлы-элементы + структурные рёбра для раскрытых карточек
  for (const card of cards) {
    if (!expanded.has(card.id)) continue;
    const editable = byId.get(card.id);
    if (!editable) continue;

    const objectiveIds = card.id === 'okr-kpi'
      ? new Set(contentItems('okr-kpi', listById(editable, 'objectives')?.items ?? []).map(o => String(o.id)))
      : null;

    for (const list of editable.lists) {
      for (const item of list.items) {
        if (!itemHasContent(card.id, item)) continue;
        const nodeId = itemNodeId(card.id, list.list, String(item.id));
        nodes.push({
          id: nodeId,
          type: 'itemNode',
          data: {
            kind: 'item',
            cardId: card.id,
            list: list.list,
            label: item.label,
            subtitle: list.title,
            hasGap: gapNodeIds.has(nodeId),
          },
        });

        // Иерархия OKR: KR/KPI цепляются к своему objective, а не к карточке.
        const parentObjId = objectiveIds && (list.list === 'keyResults' || list.list === 'kpis')
          ? String(item.id).split(':')[0]
          : null;
        if (parentObjId && objectiveIds?.has(parentObjId)) {
          const parent = itemNodeId('okr-kpi', 'objectives', parentObjId);
          edges.push({ id: `hierarchy:${parent}->${nodeId}`, source: parent, target: nodeId, kind: 'hierarchy' });
        } else {
          edges.push({ id: `containment:${nodeId}`, source: cardNodeId(card.id), target: nodeId, kind: 'containment' });
        }
      }
    }
  }

  return { nodes, edges, gaps };
}
