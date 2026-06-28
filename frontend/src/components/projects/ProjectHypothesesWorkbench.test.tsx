import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ProjectHypothesesWorkbench from './ProjectHypothesesWorkbench';
import { NAME_KEY } from './ProjectFrameworkSectionCanvas';
import { writeProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';

const PROJECT_ID = 5;

function render() {
  return renderToString(createElement(ProjectHypothesesWorkbench, { projectId: PROJECT_ID }));
}

describe('ProjectHypothesesWorkbench (smoke)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('монтируется без ошибок и показывает заголовок раздела', () => {
    const html = render();
    expect(html).toContain('Гипотезы');
  });

  it('рендерит сохранённую гипотезу и зелёный огонёк качества', () => {
    writeProjectFrameworkSectionSnapshot(PROJECT_ID, 'hypotheses', {
      projectId: PROJECT_ID,
      sectionId: 'hypotheses',
      title: 'Гипотезы',
      updatedAt: '',
      items: [],
      completedChecks: 0,
      totalChecks: 0,
      form: [
        {
          id: 1,
          values: {
            [NAME_KEY]: 'Скорость важна',
            statement: 'если доставка за 2 дня, то ≥3 согласятся, потому что скорость важнее цены',
            refuteFact: '0 согласий',
            expectedEffect: 'рост выручки KR-2',
            owner: 'Иванов',
            method: 'интервью',
          },
        },
      ],
    });

    const html = render();
    expect(html).toContain('Скорость важна');
    expect(html).toContain('готова к проверке'); // QUALITY_LABEL.green
  });
});
