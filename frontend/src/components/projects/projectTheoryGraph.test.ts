import { beforeEach, describe, expect, it } from 'vitest';
import { applyProjectEdit } from './projectEditApplier';
import {
  buildTheoryGraph,
  MISSION_NODE_ID,
  SECTION_NODE_ID,
  STRATEGY_BLOCKS,
  STRATEGY_CARD_ID,
  STRATEGY_ROOT_NODE_ID,
  STRATEGY_SECTION_NODE_ID,
  THEORY_BLOCKS,
  THEORY_CARD_ID,
  type TheoryGraph,
  type TheoryNode,
} from './projectTheoryGraph';
import type { Proposal } from './projectReview';

const PID = 21;

type BlockNode = Extract<TheoryNode, { type: 'blockNode' }>;
type ItemNode = Extract<TheoryNode, { type: 'itemNode' }>;
const blockNodes = (g: TheoryGraph, cardId = THEORY_CARD_ID) => g.nodes.filter((n): n is BlockNode => n.type === 'blockNode' && n.data.cardId === cardId);
const itemNodes = (g: TheoryGraph, cardId = THEORY_CARD_ID) => g.nodes.filter((n): n is ItemNode => n.type === 'itemNode' && n.data.cardId === cardId);

const add = (list: string, values: Record<string, string>) =>
  applyProjectEdit(PID, { id: 'x', op: 'add_item', card_id: 'project-theory', list, human: 'add', values } as Proposal);
const setMission = (field: string, value: string) =>
  applyProjectEdit(PID, { id: 'm', op: 'update_field', card_id: 'project-theory', field, value, human: 'set' } as Proposal);
const addStrategy = (list: string, values: Record<string, string>) =>
  applyProjectEdit(PID, { id: 's', op: 'add_item', card_id: STRATEGY_CARD_ID, list, human: 'add strategy', values } as Proposal);
const setStrategy = (field: string, value: string) =>
  applyProjectEdit(PID, { id: 'sf', op: 'update_field', card_id: STRATEGY_CARD_ID, field, value, human: 'set strategy' } as Proposal);

describe('buildTheoryGraph', () => {
  beforeEach(() => window.localStorage.clear());

  it('верхний слой: карточка-раздел «Теория проекта», из неё выходит Миссия', () => {
    const g = buildTheoryGraph(PID);
    const section = g.nodes.find(n => n.id === SECTION_NODE_ID);
    expect(section?.type).toBe('sectionNode');
    expect(g.edges.some(e => e.kind === 'section' && e.source === SECTION_NODE_ID && e.target === MISSION_NODE_ID)).toBe(true);
  });

  it('рисует Миссию-корень и 6 блоков Теории со структурными рёбрами Миссия→блок', () => {
    const g = buildTheoryGraph(PID);
    expect(g.nodes.find(n => n.id === MISSION_NODE_ID)).toBeDefined();
    expect(blockNodes(g)).toHaveLength(THEORY_BLOCKS.length);
    expect(g.edges.filter(e => e.kind === 'origin' && e.source === MISSION_NODE_ID)).toHaveLength(THEORY_BLOCKS.length);
    expect(itemNodes(g)).toHaveLength(0); // без раскрытия — без элементов
  });

  it('пустой проект: блоки пусты, нет узлов-элементов и смысловых рёбер', () => {
    const g = buildTheoryGraph(PID);
    expect([...blockNodes(g), ...blockNodes(g, STRATEGY_CARD_ID)].every(n => n.data.isEmpty && !n.data.expandable)).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref')).toBe(false);
  });

  it('раскрытие блока добавляет элементы и containment-ребро', () => {
    add('stakeholder', { details: 'Клиент A' });

    const collapsed = buildTheoryGraph(PID);
    expect(itemNodes(collapsed)).toHaveLength(0);
    expect(blockNodes(collapsed).find(n => n.data.list === 'stakeholder')?.data.itemCount).toBe(1);

    const expanded = buildTheoryGraph(PID, new Set(['stakeholder']));
    const items = itemNodes(expanded).filter(n => n.data.list === 'stakeholder');
    expect(items).toHaveLength(1);
    expect(items[0].data.label).toBe('Клиент A');
    expect(expanded.edges.some(e => e.kind === 'containment' && e.target === items[0].id)).toBe(true);
  });

  it('смысловая связь стейкхолдер→критерий по лейблу — только когда оба блока раскрыты', () => {
    add('results', { statement: 'Рост выручки' });
    add('stakeholder', { details: 'Клиент A', resultCriterion: 'Рост выручки' });

    const partial = buildTheoryGraph(PID, new Set(['stakeholder'])); // results свёрнут — ребра нет
    expect(partial.edges.some(e => e.kind === 'ref')).toBe(false);

    const g = buildTheoryGraph(PID, new Set(['stakeholder', 'results']));
    const edge = g.edges.find(e => e.kind === 'ref' && e.source.includes(':stakeholder:') && e.target.includes(':results:'));
    expect(edge).toBeDefined();
    // по умолчанию — семейство (принцип), точный глагол — деталь
    expect(edge?.family).toBe('вклад в результат');
    expect(edge?.verb).toBe('отвечает за');
  });

  it('связь Миссии с выбранным выгодоприобретателем', () => {
    add('stakeholder', { details: 'Генеральный директор' });
    setMission('mainBeneficiary', 'Генеральный директор');

    const g = buildTheoryGraph(PID, new Set(['stakeholder']));
    expect(g.edges.some(e => e.kind === 'ref' && e.source === MISSION_NODE_ID && e.target.includes(':stakeholder:'))).toBe(true);
  });

  it('добавляет отдельный раздел «Стратегический выбор» с корнем и блоками', () => {
    const g = buildTheoryGraph(PID);
    expect(g.nodes.find(n => n.id === STRATEGY_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === STRATEGY_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.edges.some(e => e.kind === 'section' && e.source === STRATEGY_SECTION_NODE_ID && e.target === STRATEGY_ROOT_NODE_ID)).toBe(true);
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === SECTION_NODE_ID && e.target === STRATEGY_SECTION_NODE_ID)).toBe(true);
    expect(blockNodes(g, STRATEGY_CARD_ID)).toHaveLength(STRATEGY_BLOCKS.length);
    expect(g.edges.filter(e => e.kind === 'origin' && e.source === STRATEGY_ROOT_NODE_ID)).toHaveLength(STRATEGY_BLOCKS.length);
  });

  it('стратегические ref-связи строятся из реальных полей связи и только при раскрытых блоках', () => {
    addStrategy('alternatives', { name: 'Фокус на enterprise', status: 'выбрана' });
    addStrategy('actions', { name: 'Перенастроить продажи', supportsChoiceRef: 'strategic-choice:alternatives:1' });

    const partial = buildTheoryGraph(PID, new Set(['strategic-choice:actions']));
    expect(partial.edges.some(e => e.kind === 'ref' && e.source.includes(':actions:'))).toBe(false);

    const g = buildTheoryGraph(PID, new Set(['strategic-choice:alternatives', 'strategic-choice:actions']));
    const edge = g.edges.find(e => e.kind === 'ref' && e.source.includes(':actions:') && e.target.includes(':alternatives:'));
    expect(edge).toBeDefined();
    expect(edge?.family).toBe('поддерживает выбор');
    expect(edge?.verb).toBe('поддерживает');
  });

  it('корень стратегии связывается с выбранной альтернативой по полю selectedAlternative', () => {
    addStrategy('alternatives', { name: 'Фокус на enterprise', status: 'выбрана' });
    setStrategy('selectedAlternative', 'Фокус на enterprise');

    const g = buildTheoryGraph(PID, new Set(['strategic-choice:alternatives']));
    expect(g.edges.some(e => e.kind === 'ref' && e.source === STRATEGY_ROOT_NODE_ID && e.target.includes(':alternatives:'))).toBe(true);
  });
});
