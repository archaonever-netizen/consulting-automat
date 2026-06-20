import { beforeEach, describe, expect, it } from 'vitest';
import { applyProjectEdit } from './projectEditApplier';
import { buildProjectEditModel, isEditableCard } from './projectEditModel';
import { readProjectFrameworkSectionSnapshot, type ProjectFrameworkSectionSnapshotItem } from './projectFrameworkSectionSnapshot';
import { readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { readProjectTheorySnapshot } from './projectTheorySnapshot';
import type { RecordState } from './ProjectFrameworkSectionCanvas';
import type { Proposal } from './projectReview';

const PROJECT_ID = 7;

function records(cardId: string): RecordState[] {
  return (readProjectFrameworkSectionSnapshot(PROJECT_ID, cardId)?.form as RecordState[] | undefined) ?? [];
}

function items(cardId: string): ProjectFrameworkSectionSnapshotItem[] {
  return readProjectFrameworkSectionSnapshot(PROJECT_ID, cardId)?.items ?? [];
}

describe('applyProjectEdit (section cards)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('adds a new repeatable window with provided values', () => {
    const proposal: Proposal = {
      id: 'p1', op: 'add_item', card_id: 'hypotheses', human: 'Добавить гипотезу',
      values: { __cardName: 'Гипотеза о конверсии', statement: 'если X то Y потому что Z' },
    };
    const res = applyProjectEdit(PROJECT_ID, proposal);
    expect(res.ok).toBe(true);

    const recs = records('hypotheses');
    expect(recs).toHaveLength(1);
    expect(recs[0].values.__cardName).toBe('Гипотеза о конверсии');
    expect(recs[0].values.statement).toBe('если X то Y потому что Z');
    // Производная проекция тоже пересобрана.
    expect(items('hypotheses')[0].label).toBe('Гипотеза о конверсии');
  });

  it('updates an existing window field by item_id (update_item)', () => {
    applyProjectEdit(PROJECT_ID, { id: 'a', op: 'add_item', card_id: 'tasks', human: 'add', values: { __cardName: 'Задача 1' } });
    const id = records('tasks')[0].id;

    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p2', op: 'update_item', card_id: 'tasks', item_id: String(id), human: 'Переформулировать',
      values: { statement: 'Уточнённая формулировка задачи' },
    });
    expect(res.ok).toBe(true);
    expect(records('tasks')[0].values.statement).toBe('Уточнённая формулировка задачи');
  });

  it('maps values by field label when key is unknown', () => {
    applyProjectEdit(PROJECT_ID, { id: 'a', op: 'add_item', card_id: 'tasks', human: 'add' });
    const id = records('tasks')[0].id;
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_item', card_id: 'tasks', item_id: String(id), human: 'x',
      values: { 'Формулировка задачи': 'через подпись поля' },
    });
    expect(res.ok).toBe(true);
    expect(records('tasks')[0].values.statement).toBe('через подпись поля');
  });

  it('matches an item by label when item_id is not the exact id', () => {
    applyProjectEdit(PROJECT_ID, { id: 'a', op: 'add_item', card_id: 'tasks', human: 'add', values: { __cardName: 'Настроить CRM' } });
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_item', card_id: 'tasks', item_id: 'Настроить CRM', human: 'x',
      values: { statement: 'через интеграцию' },
    });
    expect(res.ok).toBe(true);
    expect(records('tasks')[0].values.statement).toBe('через интеграцию');
  });

  it('falls back to the sole record when item_id does not match', () => {
    applyProjectEdit(PROJECT_ID, { id: 'a', op: 'add_item', card_id: 'hypotheses', human: 'add', values: { __cardName: 'Гипотеза' } });
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_item', card_id: 'hypotheses', item_id: '999', human: 'x',
      values: { statement: 'обновлено' },
    });
    expect(res.ok).toBe(true);
    expect(records('hypotheses')[0].values.statement).toBe('обновлено');
  });

  it('deletes a window by item_id', () => {
    applyProjectEdit(PROJECT_ID, { id: 'a', op: 'add_item', card_id: 'decisions', human: 'add', values: { __cardName: 'Решение 1' } });
    applyProjectEdit(PROJECT_ID, { id: 'b', op: 'add_item', card_id: 'decisions', human: 'add', values: { __cardName: 'Решение 2' } });
    expect(records('decisions')).toHaveLength(2);
    const id = records('decisions')[0].id;

    const res = applyProjectEdit(PROJECT_ID, { id: 'p', op: 'delete_item', card_id: 'decisions', item_id: String(id), human: 'Удалить дубль' });
    expect(res.ok).toBe(true);
    const left = records('decisions');
    expect(left).toHaveLength(1);
    expect(left[0].values.__cardName).toBe('Решение 2');
  });

  it('fails gracefully on missing item', () => {
    const res = applyProjectEdit(PROJECT_ID, { id: 'p', op: 'delete_item', card_id: 'tasks', item_id: '999', human: 'del' });
    expect(res.ok).toBe(false);
  });

  it('theory and okr are editable; unknown cards are not', () => {
    expect(isEditableCard('project-theory')).toBe(true);
    expect(isEditableCard('okr-kpi')).toBe(true);
    expect(isEditableCard('whole-project')).toBe(false);
    expect(applyProjectEdit(PROJECT_ID, { id: 'p', op: 'add_item', card_id: 'whole-project', human: 'x' }).ok).toBe(false);
  });
});

describe('applyProjectEdit (theory project)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('mission: update_field patches form.mission and rebuilds blocks', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_field', card_id: 'project-theory', field: 'problem', value: 'Очереди на приёмке', human: 'fix',
    });
    expect(res.ok).toBe(true);
    const snap = readProjectTheorySnapshot(PROJECT_ID)!;
    expect((snap.form as { mission: { problem: string } }).mission.problem).toBe('Очереди на приёмке');
    expect(snap.blocks.some(b => b.id === 'mission')).toBe(true);
  });

  it('rejects an unknown mission field', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_field', card_id: 'project-theory', field: 'nonexistent', value: 'x', human: 'fix',
    });
    expect(res.ok).toBe(false);
  });

  it('list: add_item to results patches form.criteria and projection', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'add_item', card_id: 'project-theory', list: 'results', human: 'add',
      values: { statement: 'Рост NPS' },
    });
    expect(res.ok).toBe(true);
    const snap = readProjectTheorySnapshot(PROJECT_ID)!;
    const form = snap.form as { criteria: Array<{ statement: string }> };
    expect(form.criteria.some(c => c.statement === 'Рост NPS')).toBe(true);
    const results = snap.blocks.find(b => b.id === 'results')!;
    expect(results.items.some(i => i.label === 'Рост NPS')).toBe(true);
  });

  it('resolves a cross-reference field from a label to the target id', () => {
    applyProjectEdit(PROJECT_ID, {
      id: 'a', op: 'add_item', card_id: 'project-theory', list: 'results', human: 'add', values: { statement: 'Рост NPS' },
    });
    const before = readProjectTheorySnapshot(PROJECT_ID)!.form as { criteria: Array<{ id: number; statement: string }> };
    const criterionId = String(before.criteria.find(c => c.statement === 'Рост NPS')!.id);

    const res = applyProjectEdit(PROJECT_ID, {
      id: 'b', op: 'update_item', card_id: 'project-theory', list: 'stakeholder', item_id: '1', human: 'link',
      values: { resultCriterion: 'Рост NPS' },
    });
    expect(res.ok).toBe(true);
    const form = readProjectTheorySnapshot(PROJECT_ID)!.form as { stakeholders: Array<{ id: number; resultCriterion: string }> };
    expect(form.stakeholders.find(s => s.id === 1)!.resultCriterion).toBe(criterionId);
  });
});

type OkrObjective = { id: number; objective: string; keyResults: Array<{ id: number; metric: string }>; kpis: Array<{ id: number; indicator: string }> };

function okrObjectives(): OkrObjective[] {
  return (readProjectFrameworkSectionSnapshot(PROJECT_ID, 'okr-kpi')?.form as OkrObjective[] | undefined) ?? [];
}

describe('applyProjectEdit (okr / kpi)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('objectives: update_item patches the objective scalar', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_item', card_id: 'okr-kpi', list: 'objectives', item_id: '1', human: 'fix',
      values: { objective: 'Стать №1 по NPS', owner: 'CPO' },
    });
    expect(res.ok).toBe(true);
    const obj = okrObjectives().find(o => o.id === 1)!;
    expect(obj.objective).toBe('Стать №1 по NPS');
  });

  it('keyResults: add_item nests a KR into the sole objective', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'add_item', card_id: 'okr-kpi', list: 'keyResults', human: 'add kr',
      values: { name: 'NPS 70', metric: 'NPS', target: '70' },
    });
    expect(res.ok).toBe(true);
    const objective = okrObjectives()[0];
    expect(objective.keyResults.some(kr => kr.metric === 'NPS')).toBe(true);
  });

  it('keyResults: update by composite id objId:krId', () => {
    applyProjectEdit(PROJECT_ID, {
      id: 'a', op: 'add_item', card_id: 'okr-kpi', list: 'keyResults', human: 'add', values: { name: 'KR', metric: 'NPS' },
    });
    const objective = okrObjectives()[0];
    const kr = objective.keyResults.find(k => k.metric === 'NPS')!;
    const compositeId = `${objective.id}:${kr.id}`;

    const res = applyProjectEdit(PROJECT_ID, {
      id: 'b', op: 'update_item', card_id: 'okr-kpi', list: 'keyResults', item_id: compositeId, human: 'fix',
      values: { target: '75' },
    });
    expect(res.ok).toBe(true);
    const updated = okrObjectives()[0].keyResults.find(k => String(k.id) === String(kr.id))! as { id: number; metric: string; target: string };
    expect(updated.target).toBe('75');
  });

  it('exposes okr as editable with three lists (objectives/keyResults/kpis)', () => {
    const model = buildProjectEditModel(PROJECT_ID);
    const okr = model.editable_cards.find(c => c.card_id === 'okr-kpi')!;
    expect(okr).toBeTruthy();
    expect(okr.lists.map(l => l.list).sort()).toEqual(['keyResults', 'kpis', 'objectives']);
    // KR-список несёт селектор родителя и опции статуса.
    const kr = okr.lists.find(l => l.list === 'keyResults')!;
    expect(kr.item_fields?.some(f => f.key === 'objectiveRef')).toBe(true);
    expect(kr.item_fields?.find(f => f.key === 'status')?.options?.length).toBeTruthy();
  });
});

describe('applyProjectEdit (complex cards)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('diagnosis: add/update/delete a symptom window patches form + projection', () => {
    const add = applyProjectEdit(PROJECT_ID, {
      id: 'p1', op: 'add_item', card_id: 'diagnosis', list: 'symptoms', human: 'Добавить симптом',
      values: { description: 'Очередь растёт', location: 'отдел продаж' },
    });
    expect(add.ok).toBe(true);
    let snap = readProjectDiagnosisSnapshot(PROJECT_ID)!;
    expect(snap.symptoms).toHaveLength(1);
    expect(snap.symptoms[0].label).toBe('Очередь растёт');
    expect(snap.symptoms[0].summary).toContain('отдел продаж');
    // form тоже содержит полный элемент.
    const form = snap.form as { symptoms: Array<{ id: number; description: string }> };
    expect(form.symptoms[0].description).toBe('Очередь растёт');
    const id = String(form.symptoms[0].id);

    const upd = applyProjectEdit(PROJECT_ID, {
      id: 'p2', op: 'update_item', card_id: 'diagnosis', list: 'symptoms', item_id: id, human: 'правка',
      values: { description: 'Очередь выросла вдвое' },
    });
    expect(upd.ok).toBe(true);
    snap = readProjectDiagnosisSnapshot(PROJECT_ID)!;
    expect(snap.symptoms[0].label).toBe('Очередь выросла вдвое');

    const del = applyProjectEdit(PROJECT_ID, { id: 'p3', op: 'delete_item', card_id: 'diagnosis', list: 'symptoms', item_id: id, human: 'удалить' });
    expect(del.ok).toBe(true);
    expect(readProjectDiagnosisSnapshot(PROJECT_ID)!.symptoms).toHaveLength(0);
  });

  it('diagnosis: update_field sets both projection scalar and form scalar', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_field', card_id: 'diagnosis', field: 'keyChallenge', value: 'Узкое место в приёмке', human: 'fix',
    });
    expect(res.ok).toBe(true);
    const snap = readProjectDiagnosisSnapshot(PROJECT_ID)!;
    expect(snap.keyChallenge).toBe('Узкое место в приёмке');
    expect((snap.form as { diagnosis: { keyChallenge: string } }).diagnosis.keyChallenge).toBe('Узкое место в приёмке');
  });

  it('diagnosis: cannot add gaps (no factory)', () => {
    const res = applyProjectEdit(PROJECT_ID, { id: 'p', op: 'add_item', card_id: 'diagnosis', list: 'gaps', human: 'add gap' });
    expect(res.ok).toBe(false);
  });

  it('strategic-choice: add a capability window', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'add_item', card_id: 'strategic-choice', list: 'capabilities', human: 'add',
      values: { name: 'Аналитика данных', competency: 'BI' },
    });
    expect(res.ok).toBe(true);
    const snap = readProjectStrategicChoiceSnapshot(PROJECT_ID)!;
    expect(snap.capabilities.some(c => c.label === 'Аналитика данных')).toBe(true);
  });

  it('strategic-choice: update_field maps howApproach -> projection howToWin', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_field', card_id: 'strategic-choice', field: 'howApproach', value: 'через автоматизацию', human: 'fix',
    });
    expect(res.ok).toBe(true);
    const snap = readProjectStrategicChoiceSnapshot(PROJECT_ID)!;
    expect(snap.howToWin).toBe('через автоматизацию');
    expect((snap.form as { choice: { howApproach: string } }).choice.howApproach).toBe('через автоматизацию');
  });

  it('target-state: add a key result (form key differs from projection key)', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'add_item', card_id: 'target-state', list: 'results', human: 'add',
      values: { name: 'Рост выручки', metric: '+20%' },
    });
    expect(res.ok).toBe(true);
    const snap = readProjectTargetStateSnapshot(PROJECT_ID)!;
    expect(snap.results.some(r => r.label === 'Рост выручки')).toBe(true);
    // form хранит под ключом targetResults.
    expect((snap.form as { targetResults: unknown[] }).targetResults).toHaveLength(1);
  });

  it('infers the list from value keys when list is omitted', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'add_item', card_id: 'diagnosis', human: 'add', values: { description: 'Простои на линии' },
    });
    expect(res.ok).toBe(true);
    expect(readProjectDiagnosisSnapshot(PROJECT_ID)!.symptoms.some(s => s.label === 'Простои на линии')).toBe(true);
  });

  it('resolves card_id given by title instead of id', () => {
    const res = applyProjectEdit(PROJECT_ID, {
      id: 'p', op: 'update_field', card_id: 'Диагноз', field: 'keyChallenge', value: 'Узкое место', human: 'fix',
    });
    expect(res.ok).toBe(true);
    expect(readProjectDiagnosisSnapshot(PROJECT_ID)!.keyChallenge).toBe('Узкое место');
  });

  it('exposes complex cards as editable in the model', () => {
    const model = buildProjectEditModel(PROJECT_ID);
    const diag = model.editable_cards.find(c => c.card_id === 'diagnosis');
    expect(diag).toBeTruthy();
    expect(diag!.fields?.some(f => f.key === 'keyChallenge')).toBe(true);
    expect(diag!.lists.some(l => l.list === 'symptoms')).toBe(true);
    // Теория теперь редактируема — присутствует среди editable_cards.
    expect(model.editable_cards.some(c => c.card_id === 'project-theory')).toBe(true);
  });

  it('exposes dropdown options to the model (theory + complex cards)', () => {
    const model = buildProjectEditModel(PROJECT_ID);

    const theory = model.editable_cards.find(c => c.card_id === 'project-theory')!;
    expect(theory.lists.some(l => l.list === 'results')).toBe(true);
    const stakeholderList = theory.lists.find(l => l.list === 'stakeholder')!;
    expect(stakeholderList.item_fields?.find(f => f.key === 'role')?.options?.length).toBeTruthy();

    const diag = model.editable_cards.find(c => c.card_id === 'diagnosis')!;
    expect(diag.fields?.find(f => f.key === 'requestType')?.options?.length).toBeTruthy();
    const symptoms = diag.lists.find(l => l.list === 'symptoms')!;
    expect(symptoms.item_fields?.find(f => f.key === 'dataSource')?.options?.length).toBeTruthy();
  });
});

describe('buildProjectEditModel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('exposes editable section cards with their items', () => {
    applyProjectEdit(PROJECT_ID, { id: 'a', op: 'add_item', card_id: 'hypotheses', human: 'add', values: { __cardName: 'H1', statement: 'если X то Y' } });

    const model = buildProjectEditModel(PROJECT_ID);
    const hyp = model.editable_cards.find(c => c.card_id === 'hypotheses');
    expect(hyp).toBeTruthy();
    const list = hyp!.lists[0];
    expect(list.items.some(i => i.label === 'H1')).toBe(true);
    expect(list.item_fields?.some(f => f.key === 'statement')).toBe(true);
    // Сложные карточки теперь тоже редактируемы.
    expect(model.editable_cards.some(c => c.card_id === 'diagnosis')).toBe(true);
  });
});
