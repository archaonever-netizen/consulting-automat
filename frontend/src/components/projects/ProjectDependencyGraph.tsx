// Интерактивный граф экрана «Весь проект» в режиме Теории проекта.
// Данные — из buildTheoryGraph (только project-theory). Раскладка ярусная и предсказуемая:
//   • Миссия — корень сверху по центру;
//   • 6 блоков Теории — ряд под Миссией в порядке экрана; структурные рёбра Миссия→блок видны всегда;
//   • элементы раскрытого блока — стопкой под ним (containment), смысловые ref-связи — по наведению.
// Инлайн: «+» в блоке (добавить элемент), «×» на элементе (удалить) — через applyProjectEdit (автоперсист).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background, Controls, Handle, MarkerType, MiniMap, Position,
  ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Edge, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildTheoryGraph, MISSION_NODE_ID, THEORY_BLOCKS, THEORY_CARD_ID,
  type TheoryBlockData, type TheoryEdgeKind, type TheoryItemData, type TheoryMissionData, type TheoryNode,
} from './projectTheoryGraph';
import { applyProjectEdit } from './projectEditApplier';
import type { Proposal } from './projectReview';

// — Геометрия —
const MISSION_W = 300, MISSION_H = 104;
const BLOCK_W = 200, BLOCK_H = 96, BLOCK_STRIDE = 232;
const BLOCKS_ROW_Y = MISSION_H + 120;
const ITEM_H = 52, ITEM_GAP_Y = 12, ITEMS_TOP = BLOCKS_ROW_Y + BLOCK_H + 36;
const ACCENT = '#2563EB', MUTED = '#94a3b8';
const ROW_W = THEORY_BLOCKS.length * BLOCK_W + (THEORY_BLOCKS.length - 1) * (BLOCK_STRIDE - BLOCK_W);
const MISSION_X = Math.max(0, (ROW_W - MISSION_W) / 2);

const blockName = (list: string) => THEORY_BLOCKS.find(b => b.list === list)?.nameField ?? 'name';

// ============ Узлы ============
type MissionNodeData = TheoryMissionData & { onOpen: () => void };
type BlockNodeData = TheoryBlockData & { onOpen: () => void; onToggle: (list: string) => void; onAdd: (list: string) => void };
type ItemNodeData = TheoryItemData & { onOpen: () => void; onDelete: (d: TheoryItemData) => void };

function MissionNode({ data }: NodeProps) {
  const d = data as unknown as MissionNodeData;
  return (
    <div className={`pg-mission${d.isEmpty ? ' is-empty' : ''}`} onClick={d.onOpen} role="button" title="Открыть Теорию проекта">
      <Handle type="source" position={Position.Bottom} id="b" />
      <span className="pg-mission-kicker">Теория проекта</span>
      <b className="pg-mission-title">{d.title}</b>
      <span className="pg-mission-statement">{d.statement || 'Миссия ещё не сформулирована'}</span>
    </div>
  );
}

function BlockNode({ data }: NodeProps) {
  const d = data as unknown as BlockNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`pg-block${d.isEmpty ? ' is-empty' : ''}`} title="Блок Теории">
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <div className="pg-block-head"><b onClick={d.onOpen}>{d.title}</b><span className="pg-chip">{d.itemCount}</span></div>
      <div className="pg-block-foot">
        <button type="button" className="pg-mini" title="Добавить элемент" onClick={e => { stop(e); d.onAdd(d.list); }}>＋</button>
        {d.expandable && <button type="button" className="pg-expand" onClick={e => { stop(e); d.onToggle(d.list); }}>{d.expanded ? '− свернуть' : `раскрыть (${d.itemCount})`}</button>}
      </div>
    </div>
  );
}

function ItemNode({ data }: NodeProps) {
  const d = data as unknown as ItemNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="pg-item" onClick={d.onOpen} title={`${d.blockTitle} — клик: открыть Теорию`}>
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <button type="button" className="pg-item-del" title="Удалить" onClick={e => { stop(e); d.onDelete(d); }}>×</button>
      <span className="pg-item-sub">{d.blockTitle}</span>
      <span className="pg-item-label">{d.label}</span>
    </div>
  );
}

const nodeTypes = { missionNode: MissionNode, blockNode: BlockNode, itemNode: ItemNode };

// ============ Раскладка ============
function layout(model: TheoryNode[]): Node[] {
  const out: Node[] = [];
  const itemsByBlock = new Map<string, Extract<TheoryNode, { type: 'itemNode' }>[]>();

  for (const n of model) {
    if (n.type === 'missionNode') {
      out.push({ id: n.id, type: 'missionNode', position: { x: MISSION_X, y: 0 }, data: n.data, zIndex: 3 });
    } else if (n.type === 'blockNode') {
      out.push({ id: n.id, type: 'blockNode', position: { x: n.data.index * BLOCK_STRIDE, y: BLOCKS_ROW_Y }, data: n.data, zIndex: 2 });
    } else {
      const bucket = itemsByBlock.get(n.data.list) ?? [];
      bucket.push(n);
      itemsByBlock.set(n.data.list, bucket);
    }
  }

  for (const [list, items] of itemsByBlock) {
    const index = THEORY_BLOCKS.findIndex(b => b.list === list);
    const baseX = (index < 0 ? 0 : index) * BLOCK_STRIDE;
    items.forEach((n, i) => {
      out.push({ id: n.id, type: 'itemNode', position: { x: baseX + 16, y: ITEMS_TOP + i * (ITEM_H + ITEM_GAP_Y) }, data: n.data, zIndex: 3 });
    });
  }
  return out;
}

// handles по типу ребра
function handlesFor(kind: TheoryEdgeKind, source: string): [string, string] {
  if (kind === 'origin') return ['b', 't'];          // Миссия (низ) → блок (верх)
  if (kind === 'containment') return ['b', 't'];      // блок (низ) → элемент (верх)
  if (source === MISSION_NODE_ID) return ['b', 't'];  // ref от Миссии к элементу
  return ['r', 'l'];                                  // ref элемент → элемент (между блоками)
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

  const onAdd = useCallback((list: string) => {
    applyEdit({ id: 'add', op: 'add_item', card_id: THEORY_CARD_ID, list, human: 'Добавить', values: { [blockName(list)]: 'Новый элемент' } } as Proposal);
    setExpanded(prev => new Set(prev).add(list));
  }, [applyEdit]);

  const onDelete = useCallback((d: TheoryItemData) => {
    applyEdit({ id: 'del', op: 'delete_item', card_id: THEORY_CARD_ID, list: d.list, item_id: d.itemId, human: 'Удалить' } as Proposal);
  }, [applyEdit]);

  const openTheory = useCallback(() => onOpenCard(THEORY_CARD_ID), [onOpenCard]);

  // editNonce — намеренная зависимость: после applyProjectEdit меняется localStorage, граф пересобираем.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const graph = useMemo(() => buildTheoryGraph(projectId, expanded), [projectId, expanded, editNonce]);

  // Узлы (стабильны при наведении — иначе сбрасывается измерение)
  useEffect(() => {
    const laid = layout(graph.nodes).map(n => {
      if (n.type === 'missionNode') return { ...n, data: { ...n.data, onOpen: openTheory } };
      if (n.type === 'blockNode') return { ...n, data: { ...n.data, onOpen: openTheory, onToggle: toggle, onAdd } };
      if (n.type === 'itemNode') return { ...n, data: { ...n.data, onOpen: openTheory, onDelete } };
      return n;
    });
    setNodes(laid);
  }, [graph, openTheory, toggle, onAdd, onDelete, setNodes]);

  // Рёбра (ref — только по наведению на конец)
  useEffect(() => {
    const rf: Edge[] = graph.edges.map(e => {
      const [sourceHandle, targetHandle] = handlesFor(e.kind, e.source);
      const isRef = e.kind === 'ref';
      const hiddenRef = isRef && !(hovered === e.source || hovered === e.target);
      return {
        id: e.id, source: e.source, target: e.target, sourceHandle, targetHandle,
        type: 'smoothstep', label: e.label, hidden: hiddenRef,
        className: `pg-edge pg-edge-${e.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: e.kind === 'origin' ? ACCENT : MUTED, width: 16, height: 16 },
      };
    });
    setEdges(rf);
  }, [graph, hovered, setEdges]);

  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.12 }), 60);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.2}
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
