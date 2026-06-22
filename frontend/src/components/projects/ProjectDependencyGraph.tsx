// Интерактивный граф зависимостей проекта (экран «Весь проект»).
// Данные берёт из buildProjectGraph, раскладку считает dagre, рисует React Flow.
// Узел-карточка раскрывается в свои элементы; клик по узлу открывает карточку.
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
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import { buildProjectGraph, type GraphCardData, type GraphItemData } from './projectGraphModel';

const CARD_W = 230;
const CARD_H = 104;
const ITEM_W = 196;
const ITEM_H = 54;

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
      <Handle type="target" position={Position.Left} />
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
      <Handle type="source" position={Position.Right} />
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
      <Handle type="target" position={Position.Left} />
      <span className="pg-item-sub">{d.subtitle}</span>
      <span className="pg-item-label">{d.label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { cardNode: CardNode, itemNode: ItemNode };

function layout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', nodesep: 26, ranksep: 96, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) {
    const isCard = n.type === 'cardNode';
    g.setNode(n.id, { width: isCard ? CARD_W : ITEM_W, height: isCard ? CARD_H : ITEM_H });
  }
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  return nodes.map(n => {
    const p = g.node(n.id);
    return { ...n, position: { x: p.x - p.width / 2, y: p.y - p.height / 2 } };
  });
}

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
    const rfNodes: Node[] = graph.nodes.map(n =>
      n.type === 'cardNode'
        ? { id: n.id, type: 'cardNode', position: { x: 0, y: 0 }, data: { ...n.data, onOpen: onOpenCard, onToggle: toggle } }
        : { id: n.id, type: 'itemNode', position: { x: 0, y: 0 }, data: { ...n.data, onOpen: onOpenCard } },
    );
    const rfEdges: Edge[] = graph.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      className: `pg-edge pg-edge-${e.kind}`,
      style: e.kind === 'feedback' ? { strokeDasharray: '6 4' } : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    }));
    return { nodes: layout(rfNodes, rfEdges), edges: rfEdges };
  }, [projectId, expanded, onOpenCard, toggle]);

  // Перецентровать вид после раскрытия/сворачивания (число узлов меняется).
  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.15 }), 0);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15 }}
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
