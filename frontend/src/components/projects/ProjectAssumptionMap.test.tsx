import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ProjectAssumptionMap from './ProjectAssumptionMap';
import { NAME_KEY, createConfigs, readProjectSources, type RecordState } from './ProjectFrameworkSectionCanvas';

const config = createConfigs(readProjectSources(1)).hypotheses;

function render(records: RecordState[]) {
  return renderToString(
    createElement(ProjectAssumptionMap, { records, config, blindZones: [], onAssign: () => {}, onSelect: () => {} }),
  );
}

describe('ProjectAssumptionMap (smoke)', () => {
  it('рендерит сетку с углом «проверять первым» и лоток «не оценено»', () => {
    const html = render([]);
    expect(html).toContain('проверять первым');
    expect(html).toContain('Не оценено');
  });

  it('размещает оценённую гипотезу на карте, неоценённую — в лотке', () => {
    const html = render([
      { id: 1, values: { [NAME_KEY]: 'Скорость важна', importance: 'высокая', uncertainty: 'высокая' } },
      { id: 2, values: { [NAME_KEY]: 'Без оценки' } },
    ]);
    expect(html).toContain('Скорость важна');
    expect(html).toContain('Без оценки');
    // Счётчик лотка: «Не оценено» и «(1)» — React вставляет между ними маркер, проверяем по частям.
    expect(html).toContain('Не оценено');
    expect(html).toContain('(1)');
  });
});
