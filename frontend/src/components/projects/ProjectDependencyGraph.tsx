// Интерактивный граф экрана «Весь проект» в режиме Теории проекта.
// Данные — из buildTheoryGraph (только project-theory). Раскладка — вертикальное дерево:
//   • Миссия — корень сверху; блоки Теории — столбиком под ней;
//   • структурные связи Миссия→блок идут слева единым «стволом» дерева (всегда видны);
//   • при раскрытии блока его элементы встают столбиком СПРАВА от него (родитель→дети слева-направо),
//     раздвигая соседние блоки по вертикали, чтобы элементы не накладывались на чужие блоки;
//   • смысловые ref-связи идут справа по отдельным «дорожкам» (lanes) — вертикальные участки разных
//     связей не ложатся друг на друга; показываются по наведению на узел.
// Инлайн: «+» в блоке (добавить элемент), «×» на элементе (удалить) — через applyProjectEdit (автоперсист).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background, BaseEdge, Controls, Handle, MarkerType, MiniMap, Position,
  ReactFlow, ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildTheoryGraph, MISSION_NODE_ID, THEORY_BLOCKS, THEORY_CARD_ID,
  type TheoryBlockData, type TheoryEdgeKind, type TheoryItemData, type TheoryMissionData, type TheoryNode,
} from './projectTheoryGraph';
import { applyProjectEdit } from './projectEditApplier';
import type { Proposal } from './projectReview';

// — Геометрия (ширины узлов совпадают с CSS: mission 300 / block 200 / item 168) —
const BLOCK_X = 96, BLOCK_W = 200, BLOCK_H = 74;
const MISSION_H = 124, BLOCKS_TOP = MISSION_H + 72;
const ITEM_W = 168, ITEM_H = 62, ITEM_GAP = 14;
const ITEM_X = BLOCK_X + BLOCK_W + 150;      // столбец элементов справа от блоков
const TRUNK_X = 60;                          // ствол структурного дерева (слева)
const CHILD_RAIL_X = BLOCK_X + BLOCK_W + 64; // рейка блок→элементы (между блоком и элементами)
const ROW_GAP = 30;
const LANE_X0 = ITEM_X + ITEM_W + 44, LANE_STEP = 30; // «дорожки» смысловых связей справа
const ACCENT = '#2563EB', MUTED = '#94a3b8';

const blockName = (list: string) => THEORY_BLOCKS.find(b => b.list === list)?.nameField ?? 'name';

// — Ортогональный путь со скруглёнными углами —
const dist = (a: number[], b: number[]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function dedupe(pts: number[][]): number[][] {
  return pts.filter((p, i) => i === 0 || dist(p, pts[i - 1]) > 0.5);
}
function orthoPath(raw: number[][], r = 9): string {
  const pts = dedupe(raw);
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const r1 = Math.min(r, dist([px, py], [cx, cy]) / 2);
    const r2 = Math.min(r, dist([cx, cy], [nx, ny]) / 2);
    const u1x = (cx - px) / (dist([px, py], [cx, cy]) || 1), u1y = (cy - py) / (dist([px, py], [cx, cy]) || 1);
    const u2x = (nx - cx) / (dist([cx, cy], [nx, ny]) || 1), u2y = (ny - cy) / (dist([cx, cy], [nx, ny]) || 1);
    d += ` L ${cx - u1x * r1},${cy - u1y * r1} Q ${cx},${cy} ${cx + u2x * r2},${cy + u2y * r2}`;
  }
  const last = pts[pts.length - 1];
  d += ` L ${last[0]},${last[1]}`;
  return d;
}

// ============ Кастомные рёбра ============
// Дерево: структурные (Миссия→блок, ствол слева) и containment (блок→элемент, рейка справа от блока).
function TreeEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, markerEnd, data }: EdgeProps) {
  const rail = (data as { rail: number }).rail;
  const pts = sourcePosition === Position.Bottom
    ? [[sourceX, sourceY], [sourceX, sourceY + 16], [rail, sourceY + 16], [rail, targetY], [targetX, targetY]]
    : [[sourceX, sourceY], [rail, sourceY], [rail, targetY], [targetX, targetY]];
  return <BaseEdge path={orthoPath(pts)} markerEnd={markerEnd} />;
}

// Смысловые ref-связи: вертикальный участок выносится на отдельную «дорожку» laneX справа;
// jog — небольшой вертикальный разнос у общего источника, чтобы стартовые отрезки не сливались.
function BusEdge({ sourceX, sourceY, targetX, targetY, markerEnd, label, data }: EdgeProps) {
  const { laneX, jog = 0 } = data as { laneX: number; jog?: number };
  const pts = [[sourceX, sourceY], [sourceX, sourceY + jog], [laneX, sourceY + jog], [laneX, targetY], [targetX, targetY]];
  return <BaseEdge path={orthoPath(pts)} markerEnd={markerEnd} label={label} labelX={laneX} labelY={(sourceY + jog + targetY) / 2} />;
}

const edgeTypes = { tree: TreeEdge, bus: BusEdge };

// ============ Узлы ============
type MissionNodeData = TheoryMissionData & { onOpen: () => void };
type BlockNodeData = TheoryBlockData & { onOpen: () => void; onToggle: (list: string) => void; onAdd: (list: string) => void };
type ItemNodeData = TheoryItemData & { onOpen: () => void; onDelete: (d: TheoryItemData) => void };

function MissionNode({ data }: NodeProps) {
  const d = data as unknown as MissionNodeData;
  return (
    <div className={`pg-mission${d.isEmpty ? ' is-empty' : ''}`} onClick={d.onOpen} role="button" title="Открыть Теорию проекта">
      <Handle type="source" position={Position.Bottom} id="b" style={{ left: 26 }} />
      <Handle type="source" position={Position.Right} id="r" />
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
      <Handle type="source" position={Position.Right} id="rs" />
      <Handle type="target" position={Position.Right} id="rt" style={{ top: '70%' }} />
      <button type="button" className="pg-item-del" title="Удалить" onClick={e => { stop(e); d.onDelete(d); }}>×</button>
      <span className="pg-item-sub">{d.blockTitle}</span>
      <span className="pg-item-label">{d.label}</span>
    </div>
  );
}

const nodeTypes = { missionNode: MissionNode, blockNode: BlockNode, itemNode: ItemNode };

// ============ Раскладка: вертикальное дерево с динамическими ярусами ============
function layout(model: TheoryNode[]): Node[] {
  const itemsByList = new Map<string, Extract<TheoryNode, { type: 'itemNode' }>[]>();
  const blocks: Extract<TheoryNode, { type: 'blockNode' }>[] = [];
  let mission: Extract<TheoryNode, { type: 'missionNode' }> | undefined;
  for (const n of model) {
    if (n.type === 'missionNode') mission = n;
    else if (n.type === 'blockNode') blocks.push(n);
    else { const b = itemsByList.get(n.data.list) ?? []; b.push(n); itemsByList.set(n.data.list, b); }
  }

  const out: Node[] = [];
  if (mission) out.push({ id: mission.id, type: 'missionNode', position: { x: BLOCK_X, y: 0 }, data: mission.data, zIndex: 4 });

  blocks.sort((a, b) => a.data.index - b.data.index);
  let y = BLOCKS_TOP;
  for (const b of blocks) {
    const items = itemsByList.get(b.data.list) ?? [];
    const itemsH = items.length ? items.length * ITEM_H + (items.length - 1) * ITEM_GAP : 0;
    const bandH = Math.max(BLOCK_H, itemsH);
    const blockY = y + (bandH - BLOCK_H) / 2; // блок по центру своего яруса (симметричный веер к детям)
    out.push({ id: b.id, type: 'blockNode', position: { x: BLOCK_X, y: blockY }, data: b.data, zIndex: 3 });
    items.forEach((n, i) => {
      out.push({ id: n.id, type: 'itemNode', position: { x: ITEM_X, y: y + i * (ITEM_H + ITEM_GAP) }, data: n.data, zIndex: 3 });
    });
    y += bandH + ROW_GAP;
  }
  return out;
}

// handles по типу ребра
function handlesFor(kind: TheoryEdgeKind, source: string): [string, string] {
  if (kind === 'origin') return ['b', 'l'];           // Миссия (низ) → блок (лево)
  if (kind === 'containment') return ['r', 'l'];       // блок (право) → элемент (лево)
  return [source === MISSION_NODE_ID ? 'r' : 'rs', 'rt']; // ref: справа источника → справа цели
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

  // Рёбра: дорожки и разнос для ref считаем стабильно (не зависят от наведения)
  const laneX = useMemo(() => {
    const lane = new Map<string, number>();
    const jog = new Map<string, number>();
    const bySource = new Map<string, string[]>();
    let i = 0;
    for (const e of graph.edges) {
      if (e.kind !== 'ref') continue;
      lane.set(e.id, LANE_X0 + i * LANE_STEP); i += 1;
      const arr = bySource.get(e.source) ?? []; arr.push(e.id); bySource.set(e.source, arr);
    }
    for (const ids of bySource.values()) ids.forEach((id, k) => jog.set(id, (k - (ids.length - 1) / 2) * 9));
    return { lane, jog };
  }, [graph]);

  useEffect(() => {
    const rf: Edge[] = graph.edges.map(e => {
      const isRef = e.kind === 'ref';
      const [sourceHandle, targetHandle] = handlesFor(e.kind, e.source);
      const hiddenRef = isRef && !(hovered === e.source || hovered === e.target);
      return {
        id: e.id, source: e.source, target: e.target, sourceHandle, targetHandle,
        type: isRef ? 'bus' : 'tree',
        data: isRef ? { laneX: laneX.lane.get(e.id), jog: laneX.jog.get(e.id) } : { rail: e.kind === 'origin' ? TRUNK_X : CHILD_RAIL_X },
        label: e.label, hidden: hiddenRef,
        className: `pg-edge pg-edge-${e.kind}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: e.kind === 'origin' ? ACCENT : MUTED, width: 15, height: 15 },
      };
    });
    setEdges(rf);
  }, [graph, hovered, laneX, setEdges]);

  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.14 }), 60);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.14 }} minZoom={0.15}
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
