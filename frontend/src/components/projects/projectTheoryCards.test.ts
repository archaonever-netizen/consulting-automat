import { beforeEach, describe, expect, it } from 'vitest';
import { applyProjectEdit } from './projectEditApplier';
import { buildTheoryGraph } from './projectTheoryGraph';
import type { Proposal } from './projectReview';

const PID = 31;
const add = (list: string, values: Record<string, string>) =>
  applyProjectEdit(PID, { id: 'x', op: 'add_item', card_id: 'project-theory', list, human: 'add', values } as Proposal);
const refEdges = (expanded: string[]) =>
  buildTheoryGraph(PID, new Set(expanded)).edges.filter(e => e.kind === 'ref');

describe('applyTheoryEdit — гарда существования элемента для ссылок', () => {
  beforeEach(() => window.localStorage.clear());

  it('ссылка на несуществующий элемент: сырой текст не вносится, просит сначала добавить элемент', () => {
    const res = add('stakeholder', { details: 'Клиент A', resultCriterion: 'Рост выручки' });
    expect(res.ok).toBe(true); // сам элемент добавлен (по полю details)
    expect(res.message).toContain('Сначала добавьте');
    expect(res.message).toContain('Рост выручки');
    // связь не создалась — ref-поле осталось пустым
    expect(refEdges(['stakeholder', 'results'])).toHaveLength(0);
  });

  it('после добавления цели та же ссылка резолвится в id и связь появляется', () => {
    add('results', { statement: 'Рост выручки' });
    const res = add('stakeholder', { details: 'Клиент A', resultCriterion: 'Рост выручки' });
    expect(res.ok).toBe(true);
    expect(res.message).not.toContain('Сначала добавьте');
    const edges = refEdges(['stakeholder', 'results']);
    expect(edges.some(e => e.source.includes(':stakeholder:') && e.target.includes(':results:'))).toBe(true);
  });

  it('update поля миссии на несуществующего стейкхолдера → отказ с просьбой добавить', () => {
    const res = applyProjectEdit(PID, { id: 'm', op: 'update_field', card_id: 'project-theory', field: 'mainBeneficiary', value: 'Генеральный директор', human: 'set' } as Proposal);
    expect(res.ok).toBe(false);
    expect(res.message).toContain('Сначала добавьте');
  });

  it('частичное совпадение применяется только если оно однозначно', () => {
    add('competencies', { name: 'Финансовый анализ' });
    add('competencies', { name: 'Финансовое моделирование' });
    // «Финанс» подходит к обоим → неоднозначно → не вносим, просим добавить
    const res = add('results', { statement: 'Рост', requiredCompetencies: 'Финанс' });
    expect(res.message).toContain('Сначала добавьте');
    expect(refEdges(['results', 'competencies'])).toHaveLength(0);
  });
});
