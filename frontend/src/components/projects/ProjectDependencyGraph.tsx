// Интерактивный граф «Весь проект» (гибрид: фазовые группы + общие кластеры сущностей).
// Данные — из buildProjectGraph. Раскладка ручная и предсказуемая:
//   • карточки — в одну линию по порядку методологии; за ними фон-полосы фазовых групп;
//   • кластеры повторяющихся сущностей — отдельной полосой ниже, карточки ссылаются на них;
//   • элементы раскрытой карточки/кластера — стопкой под контейнером;
//   • надёжные ref-связи (внутри Теории) — по наведению, чтобы не было «паутины».
// Инлайн: «+» в кластере (добавить), «×» на элементе (удалить) — через applyProjectEdit (автоперсист).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position,
  ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildProjectGraph, PHASE_GROUPS,
  type GraphCardData, type GraphClusterData, type GraphEdgeKind, type GraphGroupData, type GraphItemData, type GraphNode,
} from './projectGraphModel';
import { PROJECT_CLUSTERS, primarySource } from './projectGraphClusters';
import { applyProjectEdit } from './projectEditApplier';
import type { Proposal } from './projectReview';

// — Геометрия —
const COL_W = 250, CARD_W = 200, CARD_H = 104;
const GROUP_HEADER_Y = 34, CARD_ROW_Y = 104;
const CLUSTER_COL_W = 196, CLUSTER_H = 64;
const CLUSTER_ROW_Y = CARD_ROW_Y + CARD_H + 240;
const ITEM_H = 52, ITEM_GAP_Y = 12;
const ACCENT = '#2563EB', MUTED = '#94a3b8';

// — Имя поля при инлайн-добавлении (best-effort по списку) —
const NAME_KEY: Record<string, string> = {
  'project-theory:stakeholder': 'details', 'project-theory:results': 'statement', 'project-theory:competencies': 'name',
  'project-theory:constraints': 'statement', 'project-theory:quality': 'requirement', 'project-theory:preserve': 'details',
  'target-state:stakeholderValues': 'name', 'target-state:managementSystems': 'name', 'target-state:capabilities': 'name',
  'target-state:results': 'name', 'target-state:qualityTargets': 'name', 'target-state:preserveTargets': 'name', 'target-state:constraints': 'name',
};
const nameValues = (cardId: string, list: string, name: string) => ({ [NAME_KEY[`${cardId}:${list}`] ?? '__cardName']: name });

// ============ Узлы ============
type CardNodeData = GraphCardData & { onOpen: (c: string) => void; onToggle: (c: string) => void };
type ClusterNodeData = GraphClusterData & { onOpen: (c: string) => void; onToggle: (id: string) => void; onAdd: (id: string) => void };
type ItemNodeData = GraphItemData & { onOpen: (c: string) => void; onDelete: (d: GraphItemData) => void };

function GroupNode({ data }: NodeProps) {
  const d = data as unknown as GraphGroupData & { width: number; height: number };
  return (
    <div className="pg-group" style={{ width: d.width, height: d.height }}>
      <span className="pg-group-title">{d.title}</span>
    </div>
  );
}

function CardNode({ data }: NodeProps) {
  const d = data as unknown as CardNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`pg-card${d.isEmpty ? ' is-empty' : ''}${d.gapCount ? ' has-gap' : ''}`} onClick={() => d.onOpen(d.cardId)} role="button" title="Открыть карточку">
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Bottom} id="fb" />
      <div className="pg-card-head"><b>{d.title}</b>{d.gapCount > 0 && <span className="pg-badge-gap" title="Разрывы">{d.gapCount}</span>}</div>
      {d.headline ? <span className="pg-card-headline">{d.headline}</span> : null}
      <div className="pg-card-foot">
        <span className="pg-chip">{d.isEmpty ? 'пусто' : d.itemCount ? `${d.itemCount} эл.` : 'в кластерах'}</span>
        {d.expandable && <button type="button" className="pg-expand" onClick={e => { stop(e); d.onToggle(d.cardId); }}>{d.expanded ? '− свернуть' : '+ раскрыть'}</button>}
      </div>
    </div>
  );
}

function ClusterNode({ data }: NodeProps) {
  const d = data as unknown as ClusterNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`pg-cluster${d.isEmpty ? ' is-empty' : ''}`} title="Кластер сущностей">
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <div className="pg-cluster-head"><b onClick={() => d.onOpen(d.sourceCardIds[0] ?? 'project-theory')}>{d.title}</b><span className="pg-chip">{d.itemCount}</span></div>
      <div className="pg-cluster-foot">
        <button type="button" className="pg-mini" title="Добавить" onClick={e => { stop(e); d.onAdd(d.clusterId); }}>＋</button>
        {d.expandable && <button type="button" className="pg-expand" onClick={e => { stop(e); d.onToggle(d.clusterId); }}>{d.expanded ? '− свернуть' : `раскрыть (${d.itemCount})`}</button>}
      </div>
    </div>
  );
}

function ItemNode({ data }: NodeProps) {
  const d = data as unknown as ItemNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`pg-item${d.hasGap ? ' has-gap' : ''}`} onClick={() => d.onOpen(d.cardId)} title={`${d.subtitle} — клик: открыть карточку`}>
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <button type="button" className="pg-item-del" title="Удалить" onClick={e => { stop(e); d.onDelete(d); }}>×</button>
      <span className="pg-item-sub">{d.subtitle}</span>
      <span className="pg-item-label">{d.label}</span>
    </div>
  );
}

const nodeTypes = { groupNode: GroupNode, cardNode: CardNode, clusterNode: ClusterNode, itemNode: ItemNode };

// ============ Раскладка ============
const okrObjId = (nodeId: string) => nodeId.split(':')[3] ?? '';
const listRank = (l: string) => (l === 'objectives' ? 0 : l === 'keyResults' ? 1 : 2);

function layout(model: GraphNode[]): Node[] {
  const colByCard = new Map<string, number>();
  for (const n of model) if (n.type === 'cardNode') colByCard.set(n.data.cardId, n.data.column);

  // позиции групп-фонов (группы непрерывны в порядке методологии)
  const groupBox = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const g of PHASE_GROUPS) {
    const cols = g.cardIds.map(c => colByCard.get(c)).filter((v): v is number => v != null);
    if (!cols.length) continue;
    const min = Math.min(...cols), max = Math.max(...cols);
    groupBox.set(g.id, { x: min * COL_W - 16, y: GROUP_HEADER_Y, width: (max - min) * COL_W + CARD_W + 32, height: CARD_ROW_Y - GROUP_HEADER_Y + CARD_H + 14 });
  }

  const out: Node[] = [];
  const itemsByContainer = new Map<string, Extract<GraphNode, { type: 'itemNode' }>[]>();

  for (const n of model) {
    if (n.type === 'groupNode') {
      const box = groupBox.get(n.data.groupId) ?? { x: 0, y: GROUP_HEADER_Y, width: 200, height: 120 };
      out.push({ id: n.id, type: 'groupNode', position: { x: box.x, y: box.y }, data: { ...n.data, width: box.width, height: box.height }, draggable: false, selectable: false, zIndex: 0 });
    } else if (n.type === 'cardNode') {
      out.push({ id: n.id, type: 'cardNode', position: { x: n.data.column * COL_W, y: CARD_ROW_Y }, data: n.data, zIndex: 2 });
    } else if (n.type === 'clusterNode') {
      out.push({ id: n.id, type: 'clusterNode', position: { x: n.data.index * CLUSTER_COL_W, y: CLUSTER_ROW_Y }, data: n.data, zIndex: 2 });
    } else {
      const container = n.data.clusterId ? `cluster:${n.data.clusterId}` : `card:${n.data.cardId}`;
      const bucket = itemsByContainer.get(container) ?? [];
      bucket.push(n);
      itemsByContainer.set(container, bucket);
    }
  }

  // элементы — стопкой под своим контейнером
  for (const [container, items] of itemsByContainer) {
    let baseX = 0, baseY = 0;
    if (container.startsWith('cluster:')) {
      const idx = PROJECT_CLUSTERS.findIndex(c => `cluster:${c.id}` === container);
      baseX = (idx < 0 ? 0 : idx) * CLUSTER_COL_W; baseY = CLUSTER_ROW_Y + CLUSTER_H + 18;
    } else {
      const cardId = container.slice('card:'.length);
      baseX = (colByCard.get(cardId) ?? 0) * COL_W; baseY = CARD_ROW_Y + CARD_H + 18;
    }
    const ordered = container === 'cluster:okr' ? items : [...items].sort((a, b) => {
      const oa = Number(okrObjId(a.id)), ob = Number(okrObjId(b.id));
      return a.data.cardId === 'okr-kpi' && oa !== ob ? oa - ob : listRank(a.data.list) - listRank(b.data.list);
    });
    ordered.forEach((n, i) => {
      const childIndent = n.data.cardId === 'okr-kpi' && (n.data.list === 'keyResults' || n.data.list === 'kpis') ? 30 : 0;
      out.push({ id: n.id, type: 'itemNode', position: { x: baseX + 10 + childIndent, y: baseY + i * (ITEM_H + ITEM_GAP_Y) }, data: n.data, zIndex: 3 });
    });
  }
  return out;
}

// handles по типу ребра и типу концов
function handlesFor(kind: GraphEdgeKind, source: string): [string, string] {
  if (kind === 'backbone') return ['r', 'l'];
  if (kind === 'feedback') return ['b', 'fb'];
  if (kind === 'cluster') return ['b', 't'];
  if (kind === 'hierarchy') return ['b', 't'];
  if (kind === 'ref') return ['r', 'l'];
  // containment: из кластера — сверху элемента; из карточки — слева
  return source.startsWith('cluster:') ? ['b', 't'] : ['b', 'l'];
}

interface GraphProps { projectId: number; onOpenCard: (cardId: string) => void }

function GraphInner({ projectId, onOpenCard }: GraphProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [editNonce, setEditNonce] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const toggle = useCallback((id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const applyEdit = useCallback((proposal: Proposal) => {
    const res = applyProjectEdit(projectId, proposal);
    if (res.ok) setEditNonce(n => n + 1);
  }, [projectId]);

  const onAdd = useCallback((clusterId: string) => {
    const spec = PROJECT_CLUSTERS.find(c => c.id === clusterId);
    if (!spec) return;
    const src = primarySource(spec);
    applyEdit({ id: 'add', op: 'add_item', card_id: src.cardId, list: src.list, human: 'Добавить', values: nameValues(src.cardId, src.list, 'Новый элемент') } as Proposal);
    setExpanded(prev => new Set(prev).add(clusterId));
  }, [applyEdit]);

  const onDelete = useCallback((d: GraphItemData) => {
    applyEdit({ id: 'del', op: 'delete_item', card_id: d.cardId, list: d.list, item_id: d.itemId, human: 'Удалить' } as Proposal);
  }, [applyEdit]);

  // editNonce — намеренная зависимость: после applyProjectEdit меняется localStorage, граф пересобираем.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const graph = useMemo(() => buildProjectGraph(projectId, expanded), [projectId, expanded, editNonce]);

  // Узлы (стабильны при наведении — иначе сбрасывается измерение)
  useEffect(() => {
    const laid = layout(graph.nodes).map(n => {
      if (n.type === 'cardNode') return { ...n, data: { ...n.data, onOpen: onOpenCard, onToggle: toggle } };
      if (n.type === 'clusterNode') return { ...n, data: { ...n.data, onOpen: onOpenCard, onToggle: toggle, onAdd } };
      if (n.type === 'itemNode') return { ...n, data: { ...n.data, onOpen: onOpenCard, onDelete } };
      return n;
    });
    setNodes(laid);
  }, [graph, onOpenCard, toggle, onAdd, onDelete, setNodes]);

  // Рёбра (ref — только по наведению на конец)
  useEffect(() => {
    const rf: Edge[] = graph.edges.map(e => {
      const [sourceHandle, targetHandle] = handlesFor(e.kind, e.source);
      const isRef = e.kind === 'ref';
      const accent = e.kind === 'backbone';
      const hiddenRef = isRef && !(hovered === e.source || hovered === e.target);
      const dimCluster = e.kind === 'cluster' && hovered != null && hovered !== e.source && hovered !== e.target;
      return {
        id: e.id, source: e.source, target: e.target, sourceHandle, targetHandle,
        type: 'smoothstep', label: e.label, hidden: hiddenRef,
        className: `pg-edge pg-edge-${e.kind}${dimCluster ? ' is-dim' : ''}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: accent ? ACCENT : MUTED, width: 16, height: 16 },
      };
    });
    setEdges(rf);
  }, [graph, hovered, setEdges]);

  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.1 }), 60);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.1 }} minZoom={0.12}
      proOptions={{ hideAttribution: true }} nodesConnectable={false} edgesFocusable={false}
      onNodeMouseEnter={(_, n) => setHovered(n.id)} onNodeMouseLeave={() => setHovered(null)}
    >
      <Background gap={22} />
      <MiniMap pannable zoomable />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}

export default function ProjectDependencyGraph(props: GraphProps) {
  return (
    <div className="project-graph">
      <ReactFlowProvider><GraphInner {...props} /></ReactFlowProvider>
    </div>
  );
}
