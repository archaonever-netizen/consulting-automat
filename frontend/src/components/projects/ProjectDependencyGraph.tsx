// Интерактивный граф зависимостей проекта (экран «Весь проект»).
// Данные — из buildProjectGraph. Раскладка ручная и предсказуемая:
//   • карточки стоят строго в одну горизонтальную линию по порядку методологии;
//   • элементы раскрытой карточки уходят деревом вправо-вниз (у OKR KR/KPI — под своим
//     objective с доп. отступом), связь идёт от низа родителя к левому краю элемента.
// Рёбра подписаны смыслом связи; обратная связь — дугой снизу. Линии не масштабируются
// зумом (non-scaling-stroke), поэтому видны даже при полном отдалении.
import { useCallback, useEffect, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildProjectGraph,
  type GraphCardData,
  type GraphEdgeKind,
  type GraphItemData,
  type GraphNode,
} from './projectGraphModel';

const CARD_H = 108;
const ITEM_H = 54;
const COL_W = 380;          // шаг между колонками-карточками
const SPINE_Y = 60;         // y линии карточек
const ITEM_TOP = SPINE_Y + CARD_H + 44;
const ITEM_GAP_Y = 14;
const INDENT_L0 = 110;      // отступ элементов верхнего уровня от левого края карточки
const INDENT_L1 = 190;      // отступ дочерних элементов OKR (KR / KPI)

const ACCENT = '#2563EB';
const MUTED = '#64748b';

type CardNodeData = GraphCardData & {
  onOpen: (cardId: string) => void;
  onToggle: (cardId: string) => void;
};

function CardNode({ data }: NodeProps) {
  const d = data as unknown as CardNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      className={`pg-card${d.isEmpty ? ' is-empty' : ''}${d.gapCount ? ' has-gap' : ''}`}
      onClick={() => d.onOpen(d.cardId)}
      role="button"
      title="Открыть карточку"
    >
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Bottom} id="fb" />
      <div className="pg-card-head">
        <b>{d.title}</b>
        {d.gapCount > 0 && <span className="pg-badge-gap" title="Разрывы">{d.gapCount}</span>}
      </div>
      {d.headline ? <span className="pg-card-headline">{d.headline}</span> : null}
      <div className="pg-card-foot">
        <span className="pg-chip">{d.isEmpty ? 'пусто' : d.itemCount ? `${d.itemCount} эл.` : 'заполнено'}</span>
        {d.expandable && (
          <button
            type="button"
            className="pg-expand"
            onClick={e => { stop(e); d.onToggle(d.cardId); }}
          >
            {d.expanded ? '− свернуть' : '+ раскрыть'}
          </button>
        )}
      </div>
    </div>
  );
}

function ItemNode({ data }: NodeProps) {
  const d = data as unknown as GraphItemData & { onOpen: (cardId: string) => void };
  return (
    <div
      className={`pg-item${d.hasGap ? ' has-gap' : ''}`}
      onClick={() => d.onOpen(d.cardId)}
      title={d.subtitle}
    >
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span className="pg-item-sub">{d.subtitle}</span>
      <span className="pg-item-label">{d.label}</span>
    </div>
  );
}

const nodeTypes = { cardNode: CardNode, itemNode: ItemNode };

const listRank = (list: string) => (list === 'objectives' ? 0 : list === 'keyResults' ? 1 : 2);
const okrObjId = (nodeId: string) => nodeId.split(':')[3] ?? '';
const isOkrChild = (cardId: string, list: string) =>
  cardId === 'okr-kpi' && (list === 'keyResults' || list === 'kpis');

// Ручная раскладка: карточки в линию по колонке, элементы — деревом под своей карточкой.
function computePositions(nodes: GraphNode[]): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const colByCard = new Map<string, number>();

  for (const n of nodes) {
    if (n.type !== 'cardNode') continue;
    pos.set(n.id, { x: n.data.column * COL_W, y: SPINE_Y });
    colByCard.set(n.data.cardId, n.data.column);
  }

  const itemsByCard = new Map<string, Extract<GraphNode, { type: 'itemNode' }>[]>();
  for (const n of nodes) {
    if (n.type !== 'itemNode') continue;
    const bucket = itemsByCard.get(n.data.cardId) ?? [];
    bucket.push(n);
    itemsByCard.set(n.data.cardId, bucket);
  }

  for (const [cardId, items] of itemsByCard) {
    const colX = (colByCard.get(cardId) ?? 0) * COL_W;
    const ordered = cardId === 'okr-kpi'
      ? [...items].sort((a, b) => {
          const oa = Number(okrObjId(a.id)); const ob = Number(okrObjId(b.id));
          return oa !== ob ? oa - ob : listRank(a.data.list) - listRank(b.data.list);
        })
      : items;
    ordered.forEach((n, i) => {
      const indent = isOkrChild(cardId, n.data.list) ? INDENT_L1 : INDENT_L0;
      pos.set(n.id, { x: colX + indent, y: ITEM_TOP + i * (ITEM_H + ITEM_GAP_Y) });
    });
  }

  return pos;
}

const HANDLES: Record<GraphEdgeKind, [source: string, target: string]> = {
  backbone: ['r', 'l'],
  feedback: ['b', 'fb'],
  containment: ['b', 'l'],
  hierarchy: ['b', 'l'],
};

interface GraphProps {
  projectId: number;
  onOpenCard: (cardId: string) => void;
}

function GraphInner({ projectId, onOpenCard }: GraphProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const toggle = useCallback((cardId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  // Пересобираем узлы/рёбра при смене проекта/раскрытия. Через useNodesState/useEdgesState,
  // чтобы React Flow применил измерение размеров узлов — иначе «ручки» без координат и у
  // рёбер пустая геометрия (линии не рисуются).
  useEffect(() => {
    const graph = buildProjectGraph(projectId, expanded);
    const pos = computePositions(graph.nodes);
    const rfNodes: Node[] = graph.nodes.map(n =>
      n.type === 'cardNode'
        ? { id: n.id, type: 'cardNode', position: pos.get(n.id) ?? { x: 0, y: 0 }, data: { ...n.data, onOpen: onOpenCard, onToggle: toggle } }
        : { id: n.id, type: 'itemNode', position: pos.get(n.id) ?? { x: 0, y: 0 }, data: { ...n.data, onOpen: onOpenCard } },
    );
    const rfEdges: Edge[] = graph.edges.map(e => {
      const [sourceHandle, targetHandle] = HANDLES[e.kind];
      const accent = e.kind === 'backbone';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle,
        targetHandle,
        type: 'smoothstep',
        label: e.label,
        className: `pg-edge pg-edge-${e.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: accent ? ACCENT : MUTED, width: 18, height: 18 },
      };
    });
    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [projectId, expanded, onOpenCard, toggle, setNodes, setEdges]);

  // Перецентровать вид после раскрытия/сворачивания (число узлов меняется).
  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.12 }), 50);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.15}
      proOptions={{ hideAttribution: true }}
      nodesConnectable={false}
      edgesFocusable={false}
    >
      <Background gap={20} />
      <MiniMap pannable zoomable />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function ProjectDependencyGraph(props: GraphProps) {
  return (
    <div className="project-graph">
      <ReactFlowProvider>
        <GraphInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}
