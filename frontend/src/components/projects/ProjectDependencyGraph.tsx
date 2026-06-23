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
  buildTheoryGraph, edgeVisual, SEMANTIC_DASH, MISSION_NODE_ID, DIAGNOSIS_CARD_ID, STRATEGY_CARD_ID, THEORY_CARD_ID,
  TARGET_CARD_ID, HYPOTHESES_CARD_ID, EXPERIMENTS_CARD_ID, DECISIONS_CARD_ID,
  type TheoryBlockData, type TheoryEdgeKind, type TheoryItemData, type TheoryMissionData, type TheorySectionData, type TheoryNode,
} from './projectTheoryGraph';
import { applyProjectEdit } from './projectEditApplier';
import type { Proposal } from './projectReview';

// — Геометрия (ширины узлов совпадают с CSS: mission 300 / block 200 / item 168) —
const BLOCK_X = 96, BLOCK_W = 200, BLOCK_H = 74;
const MISSION_W = 300, MISSION_H = 124;
const SECTION_TOP = 0, SECTION_H = 60;               // верхний слой: карточка-раздел
const MISSION_TOP = SECTION_TOP + SECTION_H + 56;    // Миссия — под карточкой-разделом
const BLOCKS_TOP = MISSION_TOP + MISSION_H + 64;
const COL_CENTER_X = BLOCK_X + MISSION_W / 2;        // ось столбца раздел↔миссия (для прямой связи)
const ITEM_W = 168, ITEM_H = 62, ITEM_GAP = 14;
const ITEM_X = BLOCK_X + BLOCK_W + 150;      // столбец элементов справа от блоков
const TRUNK_X = 60;                          // ствол структурного дерева (слева)
const CHILD_RAIL_X = BLOCK_X + BLOCK_W + 64; // рейка блок→элементы (между блоком и элементами)
const ROW_GAP = 30;
const LANE_X0 = ITEM_X + ITEM_W + 44, LANE_STEP = 30; // «дорожки» смысловых связей справа
const SECTION_COLUMN_W = 720;
const ACCENT = '#2563EB', MUTED = '#94a3b8';

const SECTION_ORDER = [THEORY_CARD_ID, DIAGNOSIS_CARD_ID, STRATEGY_CARD_ID, TARGET_CARD_ID, HYPOTHESES_CARD_ID, EXPERIMENTS_CARD_ID, DECISIONS_CARD_ID];
const columnOfCard = (cardId?: string) => {
  const index = SECTION_ORDER.indexOf(cardId ?? THEORY_CARD_ID);
  return index === -1 ? SECTION_ORDER.length : index;
};
const offsetOfCard = (cardId?: string) => columnOfCard(cardId) * SECTION_COLUMN_W;

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
  const { rail, color = ACCENT, dash = '', width = 2.5 } = data as { rail: number; color?: string; dash?: string; width?: number };
  const pts = sourcePosition === Position.Bottom
    ? [[sourceX, sourceY], [sourceX, sourceY + 16], [rail, sourceY + 16], [rail, targetY], [targetX, targetY]]
    : [[sourceX, sourceY], [rail, sourceY], [rail, targetY], [targetX, targetY]];
  return <BaseEdge path={orthoPath(pts)} markerEnd={markerEnd} style={{ stroke: color, strokeDasharray: dash || undefined, strokeWidth: width }} />;
}

// Смысловые ref-связи: вертикальный участок выносится на отдельную «дорожку» laneX справа;
// jog — вертикальный разнос у общего источника; labelT — позиция подписи вдоль дорожки (доля 0..1),
// чтобы подписи разных связей не накладывались (у каждой свой laneX и своя высота).
function BusEdge({ sourceX, sourceY, targetX, targetY, markerEnd, label, data }: EdgeProps) {
  const { laneX, jog = 0, labelT = 0.5, color = MUTED, dash = SEMANTIC_DASH, width = 2 } = data as { laneX: number; jog?: number; labelT?: number; color?: string; dash?: string; width?: number };
  const sy = sourceY + jog;
  const pts = [[sourceX, sourceY], [sourceX, sy], [laneX, sy], [laneX, targetY], [targetX, targetY]];
  return (
    <BaseEdge
      path={orthoPath(pts)} markerEnd={markerEnd} style={{ stroke: color, strokeDasharray: dash || undefined, strokeWidth: width }}
      label={label} labelX={laneX} labelY={sy + labelT * (targetY - sy)} labelStyle={{ fill: color, fontWeight: 800 }}
      labelShowBg labelBgPadding={[6, 3]} labelBgBorderRadius={5}
    />
  );
}

const edgeTypes = { tree: TreeEdge, bus: BusEdge };

// ============ Узлы ============
// Клик по узлу — закрепляет/снимает его связи (pin); двойной клик — открывает Теорию.
const PIN_TITLE = 'Клик — закрепить связи · двойной клик — открыть раздел';
type SectionNodeData = TheorySectionData & { onOpen: () => void };
type MissionNodeData = TheoryMissionData & { onOpen: () => void; onPin: (id: string) => void };
type BlockNodeData = TheoryBlockData & { onOpen: () => void; onPin: (id: string) => void; onToggle: (key: string) => void; onAdd: (cardId: string, list: string, nameField: string) => void };
type ItemNodeData = TheoryItemData & { onOpen: () => void; onPin: (id: string) => void; onDelete: (d: TheoryItemData) => void };

function SectionNode({ data }: NodeProps) {
  const d = data as unknown as SectionNodeData;
  return (
    <div className="pg-section" onClick={d.onOpen} role="button" title="Открыть раздел">
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="source" position={Position.Bottom} id="b" />
      <span className="pg-section-kicker">{d.subtitle}</span>
      <b className="pg-section-title">{d.title}</b>
      <span className="pg-section-open">открыть раздел →</span>
    </div>
  );
}

function MissionNode({ id, data }: NodeProps) {
  const d = data as unknown as MissionNodeData;
  return (
    <div className={`pg-mission${d.isEmpty ? ' is-empty' : ''}`} onClick={() => d.onPin(id)} onDoubleClick={d.onOpen} role="button" title={PIN_TITLE}>
      <Handle type="target" position={Position.Top} id="t" />
      <Handle type="source" position={Position.Bottom} id="b" style={{ left: 26 }} />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="target" position={Position.Right} id="rt" style={{ top: '70%' }} />
      <span className="pg-mission-kicker">Корень раздела</span>
      <b className="pg-mission-title">{d.title}</b>
      <span className="pg-mission-statement">{d.statement || 'Миссия ещё не сформулирована'}</span>
    </div>
  );
}

function BlockNode({ id, data }: NodeProps) {
  const d = data as unknown as BlockNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className={`pg-block${d.isEmpty ? ' is-empty' : ''}`} onClick={() => d.onPin(id)} onDoubleClick={d.onOpen} title={PIN_TITLE}>
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="r" />
      <Handle type="target" position={Position.Right} id="rt" style={{ top: '70%' }} />
      <div className="pg-block-head"><b>{d.title}</b><span className="pg-chip">{d.itemCount}</span></div>
      <div className="pg-block-foot">
        {d.addable && <button type="button" className="pg-mini" title="Добавить элемент" onClick={e => { stop(e); d.onAdd(d.cardId, d.list, d.nameField); }} onDoubleClick={stop}>＋</button>}
        {d.expandable && <button type="button" className="pg-expand" onClick={e => { stop(e); d.onToggle(d.expandKey); }} onDoubleClick={stop}>{d.expanded ? '− свернуть' : `раскрыть (${d.itemCount})`}</button>}
      </div>
    </div>
  );
}

function ItemNode({ id, data }: NodeProps) {
  const d = data as unknown as ItemNodeData;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="pg-item" onClick={() => d.onPin(id)} onDoubleClick={d.onOpen} title={`${d.blockTitle} · ${PIN_TITLE}`}>
      <Handle type="target" position={Position.Left} id="l" />
      <Handle type="source" position={Position.Right} id="rs" />
      <Handle type="target" position={Position.Right} id="rt" style={{ top: '70%' }} />
      <button type="button" className="pg-item-del" title="Удалить" onClick={e => { stop(e); d.onDelete(d); }} onDoubleClick={stop}>×</button>
      <span className="pg-item-sub">{d.blockTitle}</span>
      <span className="pg-item-label">{d.label}</span>
    </div>
  );
}

const nodeTypes = { sectionNode: SectionNode, missionNode: MissionNode, blockNode: BlockNode, itemNode: ItemNode };

// ============ Раскладка: вертикальное дерево с динамическими ярусами ============
function layout(model: TheoryNode[]): Node[] {
  const itemsByBlock = new Map<string, Extract<TheoryNode, { type: 'itemNode' }>[]>();
  const blocksByCard = new Map<string, Extract<TheoryNode, { type: 'blockNode' }>[]>();
  const sections = new Map<string, Extract<TheoryNode, { type: 'sectionNode' }>>();
  const roots = new Map<string, Extract<TheoryNode, { type: 'missionNode' }>>();
  for (const n of model) {
    if (n.type === 'sectionNode') sections.set(n.data.cardId, n);
    else if (n.type === 'missionNode') roots.set(n.data.cardId, n);
    else if (n.type === 'blockNode') {
      const b = blocksByCard.get(n.data.cardId) ?? [];
      b.push(n);
      blocksByCard.set(n.data.cardId, b);
    } else {
      const key = `${n.data.cardId}:${n.data.list}`;
      const b = itemsByBlock.get(key) ?? [];
      b.push(n);
      itemsByBlock.set(key, b);
    }
  }

  const out: Node[] = [];
  const cardIds = [...new Set([...SECTION_ORDER, ...sections.keys(), ...roots.keys(), ...blocksByCard.keys()])];
  for (const cardId of cardIds) {
    const offset = offsetOfCard(cardId);
    const section = sections.get(cardId);
    const root = roots.get(cardId);
    const blocks = (blocksByCard.get(cardId) ?? []).sort((a, b) => a.data.index - b.data.index);
    if (section) out.push({ id: section.id, type: 'sectionNode', position: { x: BLOCK_X + offset, y: SECTION_TOP }, data: section.data, zIndex: 4 });
    if (root) out.push({ id: root.id, type: 'missionNode', position: { x: BLOCK_X + offset, y: MISSION_TOP }, data: root.data, zIndex: 4 });

    let y = BLOCKS_TOP;
    for (const b of blocks) {
      const items = itemsByBlock.get(`${b.data.cardId}:${b.data.list}`) ?? [];
      const itemsH = items.length ? items.length * ITEM_H + (items.length - 1) * ITEM_GAP : 0;
      const bandH = Math.max(BLOCK_H, itemsH);
      const blockY = y + (bandH - BLOCK_H) / 2; // блок по центру своего яруса (симметричный веер к детям)
      out.push({ id: b.id, type: 'blockNode', position: { x: BLOCK_X + offset, y: blockY }, data: b.data, zIndex: 3 });
      items.forEach((n, i) => {
        out.push({ id: n.id, type: 'itemNode', position: { x: ITEM_X + offset, y: y + i * (ITEM_H + ITEM_GAP) }, data: n.data, zIndex: 3 });
      });
      y += bandH + ROW_GAP;
    }
  }
  return out;
}

// handles по типу ребра
function handlesFor(kind: TheoryEdgeKind, source: string): [string, string] {
  if (kind === 'section') return ['b', 't'];           // раздел (низ) → Миссия (верх), прямой столбец
  if (kind === 'sectionLink') return ['r', 'l'];       // карточка-раздел → следующая карточка-раздел
  if (kind === 'origin') return ['b', 'l'];           // Миссия (низ) → блок (лево)
  if (kind === 'containment') return ['r', 'l'];       // блок (право) → элемент (лево)
  return [source === MISSION_NODE_ID || source.startsWith('root:') ? 'r' : 'rs', 'rt']; // ref: справа источника → справа цели
}

interface GraphProps { projectId: number; onOpenCard: (cardId: string) => void }

function GraphInner({ projectId, onOpenCard }: GraphProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [pinned, setPinned] = useState<ReadonlySet<string>>(new Set());
  const [pinnedEdges, setPinnedEdges] = useState<ReadonlySet<string>>(new Set());
  const [editNonce, setEditNonce] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const { fitView } = useReactFlow();

  const toggle = useCallback((id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  // Клик по узлу — закрепить/снять его связи.
  const onPin = useCallback((id: string) => setPinned(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  // Клик по связи — зафиксировать/снять её (видна и подсвечена даже без активного узла).
  const onEdgePin = useCallback((id: string) => setPinnedEdges(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const clearPins = useCallback(() => { setPinned(new Set()); setPinnedEdges(new Set()); setHoveredEdge(null); }, []);

  const applyEdit = useCallback((proposal: Proposal) => {
    const res = applyProjectEdit(projectId, proposal);
    if (res.ok) setEditNonce(n => n + 1);
  }, [projectId]);

  const onAdd = useCallback((cardId: string, list: string, nameField: string) => {
    applyEdit({ id: 'add', op: 'add_item', card_id: cardId, list, human: 'Добавить', values: { [nameField]: 'Новый элемент' } } as Proposal);
    setExpanded(prev => new Set(prev).add(cardId === THEORY_CARD_ID ? list : `${cardId}:${list}`));
  }, [applyEdit]);

  const onDelete = useCallback((d: TheoryItemData) => {
    applyEdit({ id: 'del', op: 'delete_item', card_id: d.cardId, list: d.list, item_id: d.itemId, human: 'Удалить' } as Proposal);
  }, [applyEdit]);

  const openCard = useCallback((cardId: string) => onOpenCard(cardId), [onOpenCard]);

  // editNonce — намеренная зависимость: после applyProjectEdit меняется localStorage, граф пересобираем.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const graph = useMemo(() => buildTheoryGraph(projectId, expanded), [projectId, expanded, editNonce]);

  // Узлы (включая признак закрепления is-pinned)
  useEffect(() => {
    const laid = layout(graph.nodes).map(n => {
      const className = pinned.has(n.id) ? 'is-pinned' : undefined;
      if (n.type === 'sectionNode') {
        const data = n.data as TheorySectionData;
        return { ...n, data: { ...data, onOpen: () => openCard(data.cardId) } };
      }
      if (n.type === 'missionNode') {
        const data = n.data as TheoryMissionData;
        return { ...n, className, data: { ...data, onOpen: () => openCard(data.cardId), onPin } };
      }
      if (n.type === 'blockNode') {
        const data = n.data as TheoryBlockData;
        return { ...n, className, data: { ...data, onOpen: () => openCard(data.cardId), onPin, onToggle: toggle, onAdd } };
      }
      if (n.type === 'itemNode') {
        const data = n.data as TheoryItemData;
        return { ...n, className, data: { ...data, onOpen: () => openCard(data.cardId), onPin, onDelete } };
      }
      return n;
    });
    setNodes(laid);
  }, [graph, pinned, openCard, onPin, toggle, onAdd, onDelete, setNodes]);

  // Рёбра. Видимы ref-связи активных узлов (pin ∪ наведённый) ИЛИ сама связь зафиксирована/наведена.
  // Дорожки (laneX) и высоту подписи (labelT) назначаем ПЛОТНО только среди видимых — чтобы и линии,
  // и подписи разных связей были разнесены и не накладывались.
  useEffect(() => {
    const active = new Set<string>(pinned);
    if (hovered) active.add(hovered);
    const refVisible = (e: typeof graph.edges[number]) =>
      e.kind === 'ref' && (active.has(e.source) || active.has(e.target) || pinnedEdges.has(e.id) || hoveredEdge === e.id);

    const graphNode = new Map(graph.nodes.map(n => [n.id, n] as const));
    const nodeCard = (id: string) => {
      const n = graphNode.get(id);
      return n?.type === 'sectionNode' || n?.type === 'missionNode' || n?.type === 'blockNode' || n?.type === 'itemNode'
        ? n.data.cardId
        : THEORY_CARD_ID;
    };
    const edgeColumn = (e: typeof graph.edges[number]) => Math.max(columnOfCard(nodeCard(e.source)), columnOfCard(nodeCard(e.target)));
    const visibleRef = graph.edges.filter(refVisible);
    const lane = new Map<string, number>();
    const jog = new Map<string, number>();
    const labelT = new Map<string, number>();
    const bySource = new Map<string, string[]>();
    const visibleByColumn = new Map<number, typeof visibleRef>();
    visibleRef.forEach(e => {
      const col = edgeColumn(e);
      const arr = visibleByColumn.get(col) ?? [];
      arr.push(e);
      visibleByColumn.set(col, arr);
    });
    for (const [col, refs] of visibleByColumn) {
      refs.forEach((e, i) => {
        lane.set(e.id, LANE_X0 + col * SECTION_COLUMN_W + i * LANE_STEP);
        labelT.set(e.id, (i + 1) / (refs.length + 1));
      });
    }
    visibleRef.forEach(e => {
      const arr = bySource.get(e.source) ?? []; arr.push(e.id); bySource.set(e.source, arr);
    });
    for (const ids of bySource.values()) ids.forEach((id, k) => jog.set(id, (k - (ids.length - 1) / 2) * 9));

    const rf: Edge[] = graph.edges.map(e => {
      const isRef = e.kind === 'ref';
      const [sourceHandle, targetHandle] = handlesFor(e.kind, e.source);
      const sourceColumn = columnOfCard(nodeCard(e.source));
      const offset = edgeColumn(e) * SECTION_COLUMN_W;
      const sectionLinkRail = BLOCK_X + sourceColumn * SECTION_COLUMN_W + MISSION_W + (SECTION_COLUMN_W - MISSION_W) / 2;
      const rail = e.kind === 'sectionLink'
        ? sectionLinkRail
        : e.kind === 'origin'
          ? TRUNK_X + offset
          : e.kind === 'section'
            ? COL_CENTER_X + offset
            : CHILD_RAIL_X + offset;
      const hot = hoveredEdge === e.id || pinnedEdges.has(e.id);
      const vis = edgeVisual(e.kind, e.target);
      const width = vis.width + (hot ? 1.5 : 0);
      return {
        id: e.id, source: e.source, target: e.target, sourceHandle, targetHandle,
        type: isRef ? 'bus' : 'tree',
        data: isRef
          ? { laneX: lane.get(e.id) ?? LANE_X0, jog: jog.get(e.id) ?? 0, labelT: labelT.get(e.id) ?? 0.5, color: vis.color, dash: vis.dash, width }
          : { rail, color: vis.color, dash: vis.dash, width },
        // По умолчанию — семейство (принцип); по наведению/фиксации — точный глагол (деталь).
        label: isRef ? (hot ? (e.verb ?? e.family) : (e.family ?? e.verb)) : e.label,
        hidden: isRef && !lane.has(e.id),
        className: `pg-edge pg-edge-${e.kind}${hot ? ' is-hot' : ''}`,
        markerEnd: { type: MarkerType.ArrowClosed, color: vis.color, width: 15, height: 15 },
      };
    });
    setEdges(rf);
  }, [graph, hovered, pinned, hoveredEdge, pinnedEdges, setEdges]);

  useEffect(() => {
    const t = window.setTimeout(() => fitView({ duration: 300, padding: 0.14 }), 60);
    return () => window.clearTimeout(t);
  }, [nodes.length, fitView]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.14 }} minZoom={0.15}
      proOptions={{ hideAttribution: true }} nodesConnectable={false} edgesFocusable={false} elementsSelectable={false}
      onNodeMouseEnter={(_, n) => setHovered(n.id)} onNodeMouseLeave={() => setHovered(null)}
      onEdgeMouseEnter={(_, e) => setHoveredEdge(e.id)} onEdgeMouseLeave={() => setHoveredEdge(null)}
      onEdgeClick={(_, e) => onEdgePin(e.id)}
      onPaneClick={clearPins}
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
