import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ProjectHypothesisPipeline from './ProjectHypothesisPipeline';
import { NAME_KEY, createConfigs, readProjectSources, type RecordState } from './ProjectFrameworkSectionCanvas';

const config = createConfigs(readProjectSources(1)).hypotheses;

function render(records: RecordState[]) {
  return renderToString(
    createElement(ProjectHypothesisPipeline, {
      records,
      config,
      onAdvance: () => {},
      onBlocked: () => {},
      onSelect: () => {},
    }),
  );
}

describe('ProjectHypothesisPipeline (smoke)', () => {
  it('рендерит колонки этапов и подсказку ворот', () => {
    const html = render([]);
    expect(html).toContain('Черновик');
    expect(html).toContain('Идёт проверка');
    expect(html).toContain('Закрыта');
    expect(html).toContain('ворота'); // подсказка ворот у этапа «идёт»/«спроектирована»
  });

  it('раскладывает гипотезы по их этапу', () => {
    const html = render([
      { id: 1, values: { [NAME_KEY]: 'Идущая', lifecycle: 'идёт' } },
      { id: 2, values: { [NAME_KEY]: 'Новая' } },
    ]);
    expect(html).toContain('Идущая');
    expect(html).toContain('Новая');
  });
});
