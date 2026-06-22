import { beforeEach, describe, expect, it } from 'vitest';
import { applyProjectEdit } from './projectEditApplier';
import { buildProjectGraph, type GraphNode, type ProjectGraph } from './projectGraphModel';
import type { Proposal } from './projectReview';

const PID = 11;

type CardNode = Extract<GraphNode, { type: 'cardNode' }>;
type ItemNode = Extract<GraphNode, { type: 'itemNode' }>;

const cardNodes = (g: ProjectGraph) => g.nodes.filter((n): n is CardNode => n.type === 'cardNode');
const itemNodes = (g: ProjectGraph) => g.nodes.filter((n): n is ItemNode => n.type === 'itemNode');
const cardNode = (g: ProjectGraph, cardId: string) => cardNodes(g).find(n => n.data.cardId === cardId);

const add = (cardId: string, values: Record<string, string>, list?: string) =>
  applyProjectEdit(PID, { id: 'x', op: 'add_item', card_id: cardId, human: 'add', ...(list ? { list } : {}), values } as Proposal);

describe('buildProjectGraph', () => {
  beforeEach(() => window.localStorage.clear());

  it('всегда рисует 13 узлов-карточек (без whole-project), без раскрытия — без элементов', () => {
    const g = buildProjectGraph(PID);
    expect(cardNodes(g)).toHaveLength(13);
    expect(cardNode(g, 'whole-project')).toBeUndefined();
    expect(cardNode(g, 'project-theory')).toBeDefined();
    expect(itemNodes(g)).toHaveLength(0);
  });

  it('содержит каркасные и обратные рёбра методологии', () => {
    const g = buildProjectGraph(PID);
    expect(g.edges.some(e => e.kind === 'backbone' && e.source === 'card:project-theory' && e.target === 'card:diagnosis')).toBe(true);
    expect(g.edges.some(e => e.kind === 'feedback' && e.source === 'card:facts-learning')).toBe(true);
  });

  it('пустой проект: карточки пусты и нет ложных разрывов', () => {
    const g = buildProjectGraph(PID);
    expect(cardNode(g, 'hypotheses')?.data.isEmpty).toBe(true);
    expect(cardNode(g, 'okr-kpi')?.data.isEmpty).toBe(true);
    expect(g.gaps).toHaveLength(0);
  });

  it('раскрытие карточки добавляет узлы-элементы и containment-ребро', () => {
    add('hypotheses', { __cardName: 'Гипотеза A', statement: 'если X то Y' });

    const collapsed = buildProjectGraph(PID);
    expect(itemNodes(collapsed)).toHaveLength(0);
    expect(cardNode(collapsed, 'hypotheses')?.data.itemCount).toBe(1);
    expect(cardNode(collapsed, 'hypotheses')?.data.expandable).toBe(true);

    const expanded = buildProjectGraph(PID, new Set(['hypotheses']));
    const items = itemNodes(expanded).filter(n => n.data.cardId === 'hypotheses');
    expect(items).toHaveLength(1);
    expect(items[0].data.label).toBe('Гипотеза A');
    expect(expanded.edges.some(e => e.kind === 'containment' && e.source === 'card:hypotheses' && e.target === items[0].id)).toBe(true);
  });

  it('подсвечивает разрыв «Гипотезы без проверок» и снимает его, когда появляются проверки', () => {
    add('hypotheses', { __cardName: 'Гипотеза A' });
    const g = buildProjectGraph(PID);
    expect(g.gaps.some(x => x.id === 'hyp-no-exp')).toBe(true);
    expect(cardNode(g, 'hypotheses')?.data.gapCount).toBeGreaterThanOrEqual(1);

    add('experiments', { __cardName: 'Проверка 1' });
    expect(buildProjectGraph(PID).gaps.some(x => x.id === 'hyp-no-exp')).toBe(false);
  });

  it('строит иерархию OKR и снимает разрыв «objective без key results» после добавления KR', () => {
    add('okr-kpi', { name: 'O1', objective: 'Рост выручки' }, 'objectives');

    let g = buildProjectGraph(PID, new Set(['okr-kpi']));
    const obj = itemNodes(g).find(n => n.data.cardId === 'okr-kpi' && n.data.list === 'objectives');
    expect(obj).toBeDefined();
    expect(g.gaps.some(x => x.id.startsWith('okr-obj-no-kr'))).toBe(true);

    add('okr-kpi', { objectiveRef: 'O1', name: 'KR1', statement: 'до 100' }, 'keyResults');

    g = buildProjectGraph(PID, new Set(['okr-kpi']));
    const kr = itemNodes(g).find(n => n.data.cardId === 'okr-kpi' && n.data.list === 'keyResults');
    expect(kr).toBeDefined();
    expect(g.edges.some(e => e.kind === 'hierarchy' && e.target === kr!.id)).toBe(true);
    expect(g.gaps.some(x => x.id.startsWith('okr-obj-no-kr'))).toBe(false);
  });
});
