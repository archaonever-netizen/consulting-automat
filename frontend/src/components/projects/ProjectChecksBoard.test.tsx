import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ProjectChecksBoard from './ProjectChecksBoard';
import { NAME_KEY, createConfigs, readProjectSources, type RecordState } from './ProjectFrameworkSectionCanvas';

const config = createConfigs(readProjectSources(1)).experiments;

function render(records: RecordState[]) {
  return renderToString(
    createElement(ProjectChecksBoard, {
      records,
      config,
      onAdvance: () => {},
      onBlocked: () => {},
      onSelect: () => {},
    }),
  );
}

describe('ProjectChecksBoard (smoke)', () => {
  it('рендерит колонки этапов и подсказку ворот', () => {
    const html = render([]);
    expect(html).toContain('Дизайн');
    expect(html).toContain('Сбор свидетельств');
    expect(html).toContain('Вердикт');
    expect(html).toContain('Следствие');
    expect(html).toContain('ворота'); // подсказка ворот у этапов после дизайна
  });

  it('раскладывает проверки по их этапу', () => {
    const html = render([
      { id: 1, values: { [NAME_KEY]: 'Идущая', stage: 'сбор' } },
      { id: 2, values: { [NAME_KEY]: 'Новая' } },
    ]);
    expect(html).toContain('Идущая');
    expect(html).toContain('Новая');
  });
});
