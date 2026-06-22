// Интерактивный граф зависимостей проекта (экран «Весь проект»).
// Данные — из buildProjectGraph. Раскладка ручная и предсказуемая: карточки стоят строго
// в одну горизонтальную линию по порядку методологии, элементы раскрытой карточки —
// вертикально под ней (у OKR сгруппированы по objective). Рёбра подписаны смыслом связи,
// обратная связь уведена дугой снизу через нижние «ручки».
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
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

const CARD_W = 230;
const CARD_H = 108;
const ITEM_W = 200;
const ITEM_H = 56;
const COL_W = 340;          // шаг между колонками-карточками
const SPINE_Y = 60;         // y линии карточек
const ITEM_TOP = SPINE_Y + CARD_H + 64;
const ITEM_GAP_Y = 14;

const ACCENT = '#2563EB';
const MUTED = '#c4ccda';

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
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span className="pg-item-sub">{d.subtitle}</span>
      <span className="pg-item-label">{d.label}</span>
    </div>
  );
}

const nodeTypes = { cardNode: CardNode, itemNode: ItemNode };

const listRank = (list: string) => (list === 'objectives' ? 0 : list === 'keyResults' ? 1 : 2);
const okrObjId = (nodeId: string) => nodeId.split(':')[3] ?? '';

// Ручная раскладка: карточки в линию по колонке, элементы — стопкой под своей карточкой.
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
    const baseX = (colByCard.get(cardId) ?? 0) * COL_W + (CARD_W - ITEM_W) / 2;
    const ordered = cardId === 'okr-kpi'
      ? [...items].sort((a, b) => {
          const oa = Number(okrObjId(a.id)); const ob = Number(okrObjId(b.id));
          return oa !== ob ? oa - ob : listRank(a.data.list) - listRank(b.data.list);
        })
      : items;
    ordered.forEach((n, i) => {
      const indent = n.data.list === 'keyResults' || n.data.list === 'kpis' ? 28 : 0;
      pos.set(n.id, { x: baseX + indent, y: ITEM_TOP + i * (ITEM_H + ITEM_GAP_Y) });
    });
  }

  return pos;
}

const HANDLES: Record<GraphEdgeKind, [source: string, target: string]> = {
  backbone: ['r', 'l'],
  feedback: ['b', 'fb'],
  containment: ['b', 't'],
  hierarchy: ['b', 't'],
};

interface GraphProps {
  projectId: number;
  onOpenCard: (cardId: string) => void;
}

function GraphInner({ projectId, onOpenCard }: GraphProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const { fitView } = useReactFlow();

  const toggle = useCallback((cardId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const { nodes, edges } = useMemo(() => {
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
        labelShowBg: true,
        className: `pg-edge pg-edge-${e.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: accent ? ACCENT : MUTED, width: 16, height: 16 },
      };
    });
    return { nodes: rfNodes, edges: rfEdges };
  }, [projectId, expanded, onOpenCard, toggle]);

  // Перецентровать вид после раскрытия/сворачивания (число узлов меняется).
  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.12 }), 0);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.12 }}
      minZoom={0.2}
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
