import { describe, expect, it } from 'vitest';
import {
  createEvidence,
  evidenceOf,
  parseEvidence,
  serializeEvidence,
  summarizeEvidence,
  type Evidence,
} from './projectCheckEvidence';

describe('projectCheckEvidence', () => {
  it('parseEvidence: пусто/мусор → пустой список', () => {
    expect(parseEvidence(undefined)).toEqual([]);
    expect(parseEvidence('')).toEqual([]);
    expect(parseEvidence('   ')).toEqual([]);
    expect(parseEvidence('не json')).toEqual([]);
    expect(parseEvidence('{"a":1}')).toEqual([]); // не массив
    expect(parseEvidence('[1, "x", null]')).toEqual([]); // нет объектов
  });

  it('parseEvidence: разбирает валидный список и сохраняет id', () => {
    const items = parseEvidence(JSON.stringify([
      { id: 'e1', kind: 'file', title: 'Протокол', stance: 'за', measuredValue: '4 «да»', storagePath: 'p/1.pdf' },
    ]));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'e1', kind: 'file', title: 'Протокол', stance: 'за', storagePath: 'p/1.pdf' });
  });

  it('parseEvidence: чинит неизвестные kind/stance к значениям по умолчанию', () => {
    const [item] = parseEvidence(JSON.stringify([{ id: 'e1', kind: 'видео', stance: 'может быть' }]));
    expect(item.kind).toBe('note');
    expect(item.stance).toBe('нейтрально');
  });

  it('serializeEvidence ↔ parseEvidence — round-trip', () => {
    const items: Evidence[] = [
      createEvidence({ id: 'e1', kind: 'link', title: 'Звонок', stance: 'за', measuredValue: '1', url: 'https://x' }),
      createEvidence({ id: 'e2', kind: 'note', title: 'Отказ', stance: 'против' }),
    ];
    expect(parseEvidence(serializeEvidence(items))).toEqual(items);
  });

  it('summarizeEvidence считает за/против/нейтрально и измеренные', () => {
    const items = [
      createEvidence({ stance: 'за', measuredValue: '4' }),
      createEvidence({ stance: 'за', measuredValue: '' }),
      createEvidence({ stance: 'против', measuredValue: '1' }),
      createEvidence({ stance: 'нейтрально' }),
    ];
    expect(summarizeEvidence(items)).toEqual({ total: 4, for: 2, against: 1, neutral: 1, measured: 2 });
  });

  it('evidenceOf читает свидетельства из values.evidence', () => {
    const raw = serializeEvidence([createEvidence({ id: 'e1', title: 'X' })]);
    expect(evidenceOf({ evidence: raw }).map(e => e.id)).toEqual(['e1']);
    expect(evidenceOf({})).toEqual([]);
  });

  it('createEvidence заполняет значения по умолчанию и генерирует id', () => {
    const item = createEvidence({ title: 'Без id' });
    expect(item.id).toMatch(/^ev-/);
    expect(item.kind).toBe('note');
    expect(item.stance).toBe('нейтрально');
    expect(item.addedAt).not.toBe('');
  });
});
