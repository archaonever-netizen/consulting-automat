import { beforeEach, describe, expect, it } from 'vitest';
import { applyProjectEdit } from './projectEditApplier';
import {
  buildTheoryGraph,
  DIAGNOSIS_BLOCKS,
  DIAGNOSIS_CARD_ID,
  DIAGNOSIS_ROOT_NODE_ID,
  DIAGNOSIS_SECTION_NODE_ID,
  DECISIONS_CARD_ID,
  DECISIONS_ROOT_NODE_ID,
  DECISIONS_SECTION_NODE_ID,
  EXPERIMENTS_CARD_ID,
  EXPERIMENTS_ROOT_NODE_ID,
  EXPERIMENTS_SECTION_NODE_ID,
  GENERIC_GRAPH_SECTIONS,
  HYPOTHESES_CARD_ID,
  HYPOTHESES_ROOT_NODE_ID,
  HYPOTHESES_SECTION_NODE_ID,
  MISSION_NODE_ID,
  SECTION_NODE_ID,
  STRATEGY_BLOCKS,
  STRATEGY_CARD_ID,
  STRATEGY_ROOT_NODE_ID,
  STRATEGY_SECTION_NODE_ID,
  STRATEGY_MAP_CARD_ID,
  STRATEGY_MAP_ROOT_NODE_ID,
  STRATEGY_MAP_SECTION_NODE_ID,
  TARGET_BLOCKS,
  TARGET_CARD_ID,
  TARGET_ROOT_NODE_ID,
  TARGET_SECTION_NODE_ID,
  THEORY_BLOCKS,
  THEORY_CARD_ID,
  type TheoryGraph,
  type TheoryNode,
} from './projectTheoryGraph';
import { getFallbackProjectDiagnosisSnapshot, writeProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
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
const addTarget = (list: string, values: Record<string, string>) =>
  applyProjectEdit(PID, { id: 't', op: 'add_item', card_id: TARGET_CARD_ID, list, human: 'add target', values } as Proposal);
const addSection = (cardId: string, values: Record<string, string>) =>
  applyProjectEdit(PID, { id: 'g', op: 'add_item', card_id: cardId, human: 'add section', values } as Proposal);
// Диагноз — сложная карточка с засеянными «разрывами» (createItem: null), поэтому
// для тестов пишем форму снапшота напрямую (как это делает редактор при первом открытии).
const seedDiagnosis = (form: Record<string, unknown>) =>
  writeProjectDiagnosisSnapshot(PID, {
    ...getFallbackProjectDiagnosisSnapshot(PID),
    form: { diagnosis: {}, gaps: [], symptoms: [], facts: [], alternatives: [], verifications: [], consequences: [], ...form },
  });

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
    // Стратегический выбор стоит в цепочке после Диагноза: Теория → Диагноз → Стратегический выбор.
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === DIAGNOSIS_SECTION_NODE_ID && e.target === STRATEGY_SECTION_NODE_ID)).toBe(true);
    expect(blockNodes(g, STRATEGY_CARD_ID)).toHaveLength(STRATEGY_BLOCKS.length);
    expect(g.edges.filter(e => e.kind === 'origin' && e.source === STRATEGY_ROOT_NODE_ID)).toHaveLength(STRATEGY_BLOCKS.length);
  });

  it('стратегические ref-связи: к элементу при раскрытой цели, к блоку-цели при свёрнутой (фолбэк)', () => {
    addStrategy('alternatives', { name: 'Фокус на enterprise', status: 'выбрана' });
    addStrategy('actions', { name: 'Перенастроить продажи', supportsChoiceRef: 'strategic-choice:alternatives:1' });

    // Блок-цель свёрнут → связь ведёт к УЗЛУ БЛОКА альтернатив (не исчезает).
    const partial = buildTheoryGraph(PID, new Set(['strategic-choice:actions']));
    const toBlock = partial.edges.find(e => e.kind === 'ref' && e.source.includes(':actions:') && e.target === 'block:strategic-choice:alternatives');
    expect(toBlock).toBeDefined();
    expect(toBlock?.family).toBe('поддерживает выбор');

    // Оба блока раскрыты → связь уточняется до конкретной альтернативы.
    const g = buildTheoryGraph(PID, new Set(['strategic-choice:alternatives', 'strategic-choice:actions']));
    const edge = g.edges.find(e => e.kind === 'ref' && e.source.includes(':actions:') && e.target.includes(':alternatives:'));
    expect(edge).toBeDefined();
    expect(edge?.family).toBe('поддерживает выбор');
    expect(edge?.verb).toBe('поддерживает');
  });

  it('связывает capability стратегического выбора с компетенцией Теории проекта (с фолбэком на блок)', () => {
    add('competencies', { name: 'Опыт создания подразделений' });
    addStrategy('capabilities', {
      name: 'Интеграция данных без слома IT ГО',
      competency: 'Опыт создания подразделений',
    });

    // Колонка Теории свёрнута → межсекционная связь ведёт к УЗЛУ БЛОКА компетенций.
    const partial = buildTheoryGraph(PID, new Set(['strategic-choice:capabilities']));
    expect(partial.edges.some(e => e.kind === 'ref' && e.source.includes(':capabilities:') && e.target === 'block:competencies')).toBe(true);

    const g = buildTheoryGraph(PID, new Set(['competencies', 'strategic-choice:capabilities']));
    const edge = g.edges.find(e => e.kind === 'ref' && e.source.includes(':capabilities:') && e.target.includes(':competencies:'));
    expect(edge).toBeDefined();
    expect(edge?.family).toBe('требует способности');
    expect(edge?.verb).toBe('требует');
  });

  it('корень стратегии связывается с выбранной альтернативой по полю selectedAlternative', () => {
    addStrategy('alternatives', { name: 'Фокус на enterprise', status: 'выбрана' });
    setStrategy('selectedAlternative', 'Фокус на enterprise');

    const g = buildTheoryGraph(PID, new Set(['strategic-choice:alternatives']));
    expect(g.edges.some(e => e.kind === 'ref' && e.source === STRATEGY_ROOT_NODE_ID && e.target.includes(':alternatives:'))).toBe(true);
  });

  it('добавляет отдельный раздел «Диагноз» с корнем, блоками и цепочкой Теория→Диагноз', () => {
    const g = buildTheoryGraph(PID);
    expect(g.nodes.find(n => n.id === DIAGNOSIS_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === DIAGNOSIS_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.edges.some(e => e.kind === 'section' && e.source === DIAGNOSIS_SECTION_NODE_ID && e.target === DIAGNOSIS_ROOT_NODE_ID)).toBe(true);
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === SECTION_NODE_ID && e.target === DIAGNOSIS_SECTION_NODE_ID)).toBe(true);
    expect(blockNodes(g, DIAGNOSIS_CARD_ID)).toHaveLength(DIAGNOSIS_BLOCKS.length);
    expect(g.edges.filter(e => e.kind === 'origin' && e.source === DIAGNOSIS_ROOT_NODE_ID)).toHaveLength(DIAGNOSIS_BLOCKS.length);
  });

  it('у блока «Разрывы» нельзя добавлять элементы (addable=false), у остальных блоков Диагноза — можно', () => {
    const g = buildTheoryGraph(PID);
    const blocks = blockNodes(g, DIAGNOSIS_CARD_ID);
    expect(blocks.find(n => n.data.list === 'gaps')?.data.addable).toBe(false);
    expect(blocks.filter(n => n.data.list !== 'gaps').every(n => n.data.addable)).toBe(true);
  });

  it('пустой Диагноз: разрывы засеяны экраном, но в графе блоки пусты без смысловых рёбер', () => {
    const g = buildTheoryGraph(PID);
    expect(blockNodes(g, DIAGNOSIS_CARD_ID).every(n => n.data.isEmpty && !n.data.expandable)).toBe(true);
    expect(itemNodes(g, DIAGNOSIS_CARD_ID)).toHaveLength(0);
  });

  it('связь симптом→разрыв (relatedGap) и кросс-связь разрыв→блок Теории (theoryBlock)', () => {
    seedDiagnosis({
      gaps: [{ id: 1, theoryBlock: 'results', expectedState: 'Результат измерим', observedReality: 'Срыв сроков', gap: 'Ожидалось X, фактически Y', confirmingFact: '', status: 'Требует проверки' }],
      symptoms: [{ id: 1, description: 'Жалобы на сроки', location: '', affected: '', frequency: '', relatedGap: '1. Критерии результата', dataSource: '' }],
    });

    const collapsed = buildTheoryGraph(PID, new Set(['diagnosis:symptoms'])); // разрывы свёрнуты — связи симптом→разрыв нет
    expect(collapsed.edges.some(e => e.kind === 'ref' && e.source.includes('item:diagnosis:symptoms:') && e.target.includes('item:diagnosis:gaps:'))).toBe(false);

    const g = buildTheoryGraph(PID, new Set(['diagnosis:gaps', 'diagnosis:symptoms']));
    const symptomToGap = g.edges.find(e => e.kind === 'ref' && e.source.includes('item:diagnosis:symptoms:') && e.target.includes('item:diagnosis:gaps:'));
    expect(symptomToGap).toBeDefined();
    expect(symptomToGap?.family).toBe('проявление разрыва');

    const gapToTheory = g.edges.find(e => e.kind === 'ref' && e.source.includes('item:diagnosis:gaps:') && e.target === 'block:results');
    expect(gapToTheory).toBeDefined();
    expect(gapToTheory?.family).toBe('проверка Теории');
    expect(gapToTheory?.verb).toBe('проверяет блок Теории');
  });

  it('связь разрыв→факт (confirmingFact) по имени факта', () => {
    seedDiagnosis({
      gaps: [{ id: 1, theoryBlock: 'results', expectedState: 'X', observedReality: 'Y', gap: 'Разрыв', confirmingFact: 'Падение конверсии', status: 'Требует проверки' }],
      facts: [{ id: 1, indicator: 'Падение конверсии', value: '-30%', period: 'Q2', dataSource: 'CRM', reliability: 'высокая', confirms: '' }],
    });

    const g = buildTheoryGraph(PID, new Set(['diagnosis:gaps', 'diagnosis:facts']));
    const gapToFact = g.edges.find(e => e.kind === 'ref' && e.source.includes('item:diagnosis:gaps:') && e.target.includes('item:diagnosis:facts:'));
    expect(gapToFact).toBeDefined();
    expect(gapToFact?.family).toBe('подтверждение фактом');
  });

  it('добавляет отдельный раздел «Целевое состояние» с корнем, блоками и цепочкой после Стратегического выбора', () => {
    const g = buildTheoryGraph(PID);
    expect(g.nodes.find(n => n.id === TARGET_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === TARGET_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.edges.some(e => e.kind === 'section' && e.source === TARGET_SECTION_NODE_ID && e.target === TARGET_ROOT_NODE_ID)).toBe(true);
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === STRATEGY_SECTION_NODE_ID && e.target === TARGET_SECTION_NODE_ID)).toBe(true);
    expect(blockNodes(g, TARGET_CARD_ID)).toHaveLength(TARGET_BLOCKS.length);
    expect(g.edges.filter(e => e.kind === 'origin' && e.source === TARGET_ROOT_NODE_ID)).toHaveLength(TARGET_BLOCKS.length);
  });

  it('целевое состояние строит ref-связи из структурных полей к Теории и Стратегическому выбору', () => {
    add('results', { statement: 'Рост выручки' });
    add('stakeholder', { details: 'Генеральный директор' });
    add('quality', { requirement: 'Скорость ответа' });
    add('preserve', { details: 'Доверие команды' });
    add('constraints', { statement: 'Без остановки продаж' });
    addStrategy('capabilities', { name: 'Интеграция данных' });
    addTarget('results', { name: 'Выручка 150%', criterion: 'Рост выручки' });
    addTarget('stakeholderValues', { name: 'Ценность для ГД', stakeholder: 'Генеральный директор', measurement: 'Рост выручки' });
    addTarget('capabilities', { name: 'Целевая интеграция', competency: 'Интеграция данных' });
    addTarget('managementSystems', { name: 'Совет по данным', supportsChoice: 'Интеграция данных' });
    addTarget('qualityTargets', { name: 'SLA', qualityIndicator: 'Скорость ответа' });
    addTarget('preserveTargets', { name: 'Сохранить доверие', preserveElement: 'Доверие команды' });
    addTarget('constraints', { name: 'Продажи работают', constraint: 'Без остановки продаж' });
    addTarget('keyResults', { name: 'KR выручка', metric: 'Рост выручки' });

    const g = buildTheoryGraph(PID, new Set([
      'results', 'stakeholder', 'quality', 'preserve', 'constraints',
      'strategic-choice:capabilities',
      'target-state:results', 'target-state:stakeholderValues', 'target-state:capabilities',
      'target-state:managementSystems', 'target-state:qualityTargets', 'target-state:preserveTargets',
      'target-state:constraints', 'target-state:keyResults',
    ]));

    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:results:') && e.target.includes('item:project-theory:results:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:stakeholderValues:') && e.target.includes('item:project-theory:stakeholder:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:capabilities:') && e.target.includes('item:strategic-choice:capabilities:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:managementSystems:') && e.target.includes('item:strategic-choice:capabilities:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:qualityTargets:') && e.target.includes('item:project-theory:quality:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:preserveTargets:') && e.target.includes('item:project-theory:preserve:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:constraints:') && e.target.includes('item:project-theory:constraints:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:keyResults:') && e.target.includes('item:project-theory:results:'))).toBe(true);
  });

  it('целевое состояние: межсекционные связи не исчезают при свёрнутой Теории (фолбэк на блок)', () => {
    add('results', { statement: 'Рост выручки' });
    add('preserve', { details: 'Доверие команды' });
    addTarget('results', { name: 'Выручка 150%', criterion: 'Рост выручки' });
    addTarget('preserveTargets', { name: 'Сохранить доверие', preserveElement: 'Доверие команды' });

    // Раскрыты ТОЛЬКО блоки самого Целевого состояния; колонка Теории свёрнута —
    // раньше связи исчезали, теперь ведут к узлам блоков Теории (block:results / block:preserve).
    const g = buildTheoryGraph(PID, new Set(['target-state:results', 'target-state:preserveTargets']));
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:results:') && e.target === 'block:results')).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:target-state:preserveTargets:') && e.target === 'block:preserve')).toBe(true);
  });

  it('добавляет раздел «Стратегическая карта» между Целевым состоянием и Гипотезами', () => {
    const g = buildTheoryGraph(PID);
    expect(g.nodes.find(n => n.id === STRATEGY_MAP_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === STRATEGY_MAP_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.edges.some(e => e.kind === 'section' && e.source === STRATEGY_MAP_SECTION_NODE_ID && e.target === STRATEGY_MAP_ROOT_NODE_ID)).toBe(true);
    // Цепочка: Целевое состояние → Стратегическая карта → Гипотезы.
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === TARGET_SECTION_NODE_ID && e.target === STRATEGY_MAP_SECTION_NODE_ID)).toBe(true);
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === STRATEGY_MAP_SECTION_NODE_ID && e.target === HYPOTHESES_SECTION_NODE_ID)).toBe(true);
    expect(blockNodes(g, STRATEGY_MAP_CARD_ID)).toHaveLength(1);
    expect(g.edges.some(e => e.kind === 'origin' && e.source === STRATEGY_MAP_ROOT_NODE_ID)).toBe(true);
  });

  it('стратегическая карта: цель влияет на результат, гипотеза проверяет узел карты', () => {
    add('results', { statement: 'Рост выручки' });
    addSection(STRATEGY_MAP_CARD_ID, { __cardName: 'Ускорить онбординг', goal: 'Ускорить онбординг', effect: 'Рост выручки' });
    addSection(HYPOTHESES_CARD_ID, { __cardName: 'H1', statement: 'Если ускорим онбординг, вырастет выручка', mapNode: 'Ускорить онбординг' });

    // Блок-цель (результаты Теории) свёрнут → связь цели карты ведёт к УЗЛУ БЛОКА (фолбэк).
    const partial = buildTheoryGraph(PID, new Set(['strategy-map:strategy-map']));
    expect(partial.edges.some(e => e.kind === 'ref' && e.source.includes('item:strategy-map:strategy-map:') && e.target === 'block:results')).toBe(true);

    const g = buildTheoryGraph(PID, new Set([
      'results', 'strategy-map:strategy-map', 'hypotheses:hypotheses',
    ]));

    const goalToResult = g.edges.find(e => e.kind === 'ref' && e.source.includes('item:strategy-map:strategy-map:') && e.target.includes('item:project-theory:results:'));
    expect(goalToResult).toBeDefined();
    expect(goalToResult?.family).toBe('вклад в результат');

    const hypoToMap = g.edges.find(e => e.kind === 'ref' && e.source.includes('item:hypotheses:hypotheses:') && e.target.includes('item:strategy-map:strategy-map:'));
    expect(hypoToMap).toBeDefined();
    expect(hypoToMap?.verb).toBe('проверяет узел карты');
  });

  it('добавляет разделы «Гипотезы», «Проверки», «Решения» с корнями, блоками и методологической цепочкой', () => {
    const g = buildTheoryGraph(PID);
    expect(g.nodes.find(n => n.id === HYPOTHESES_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === HYPOTHESES_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.nodes.find(n => n.id === EXPERIMENTS_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === EXPERIMENTS_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.nodes.find(n => n.id === DECISIONS_SECTION_NODE_ID)?.type).toBe('sectionNode');
    expect(g.nodes.find(n => n.id === DECISIONS_ROOT_NODE_ID)?.type).toBe('missionNode');
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === STRATEGY_MAP_SECTION_NODE_ID && e.target === HYPOTHESES_SECTION_NODE_ID)).toBe(true);
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === HYPOTHESES_SECTION_NODE_ID && e.target === EXPERIMENTS_SECTION_NODE_ID)).toBe(true);
    expect(g.edges.some(e => e.kind === 'sectionLink' && e.source === EXPERIMENTS_SECTION_NODE_ID && e.target === DECISIONS_SECTION_NODE_ID)).toBe(true);
    for (const section of GENERIC_GRAPH_SECTIONS) {
      expect(blockNodes(g, section.cardId)).toHaveLength(1);
      expect(g.edges.some(e => e.kind === 'origin' && e.source === section.rootId)).toBe(true);
    }
  });

  it('гипотезы, проверки и решения строят ref-связи из реальных полей-ссылок', () => {
    add('results', { statement: 'Рост выручки' });
    add('constraints', { statement: 'Без остановки продаж' });
    addStrategy('capabilities', { name: 'Интеграция данных' });
    addSection(HYPOTHESES_CARD_ID, { __cardName: 'H1', statement: 'Если интегрируем данные, то вырастет выручка', strategicChoice: 'Интеграция данных' });
    addSection(EXPERIMENTS_CARD_ID, { __cardName: 'E1', subject: 'Пилот интеграции', hypothesis: 'H1', metric: 'Рост выручки', constraints: 'Без остановки продаж' });
    addSection(DECISIONS_CARD_ID, { __cardName: 'D1', statement: 'Запустить интеграцию', checkResult: 'E1', relatedHypothesis: 'H1', relatedCriterion: 'Рост выручки', constraints: 'Без остановки продаж' });

    const g = buildTheoryGraph(PID, new Set([
      'results', 'constraints', 'strategic-choice:capabilities',
      'hypotheses:hypotheses', 'experiments:experiments', 'decisions:decisions',
    ]));

    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:hypotheses:hypotheses:') && e.target.includes('item:strategic-choice:capabilities:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:experiments:experiments:') && e.target.includes('item:hypotheses:hypotheses:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:experiments:experiments:') && e.target.includes('item:project-theory:results:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:experiments:experiments:') && e.target.includes('item:project-theory:constraints:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:decisions:decisions:') && e.target.includes('item:experiments:experiments:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:decisions:decisions:') && e.target.includes('item:hypotheses:hypotheses:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:decisions:decisions:') && e.target.includes('item:project-theory:results:'))).toBe(true);
    expect(g.edges.some(e => e.kind === 'ref' && e.source.includes('item:decisions:decisions:') && e.target.includes('item:project-theory:constraints:'))).toBe(true);
  });
});
