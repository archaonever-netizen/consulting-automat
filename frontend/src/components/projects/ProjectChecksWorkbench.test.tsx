import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import ProjectChecksWorkbench from './ProjectChecksWorkbench';
import { NAME_KEY } from './ProjectFrameworkSectionCanvas';
import { writeProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { createEvidence, serializeEvidence } from './projectCheckEvidence';

const PROJECT_ID = 7;

function render() {
  return renderToString(createElement(ProjectChecksWorkbench, { projectId: PROJECT_ID }));
}

describe('ProjectChecksWorkbench (smoke)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('монтируется без ошибок и показывает заголовок и этапы', () => {
    const html = render();
    expect(html).toContain('Проверки');
    expect(html).toContain('Сбор свидетельств'); // метка степпера
    expect(html).toContain('Свидетельства');
  });

  it('рендерит сохранённую проверку, её вердикт и свидетельства', () => {
    writeProjectFrameworkSectionSnapshot(PROJECT_ID, 'experiments', {
      projectId: PROJECT_ID,
      sectionId: 'experiments',
      title: 'Проверки',
      updatedAt: '',
      items: [],
      completedChecks: 0,
      totalChecks: 0,
      form: [
        {
          id: 1,
          values: {
            [NAME_KEY]: 'Опрос заводов',
            hypothesis: 'Заводам важна скорость',
            subject: 'Опрос 10 заводов',
            method: 'интервью',
            metric: 'доля согласных',
            confirmThreshold: '≥3 из 10',
            refuteThreshold: '≤1 из 10',
            stage: 'вердикт',
            result: 'подтверждена',
            evidence: serializeEvidence([
              createEvidence({ id: 'e1', kind: 'link', title: 'Протокол интервью', stance: 'за', measuredValue: '4 из 10' }),
            ]),
          },
        },
      ],
    });

    const html = render();
    expect(html).toContain('Опрос заводов');
    expect(html).toContain('подтверждена');
    expect(html).toContain('Протокол интервью');
  });

  it('рендерит файл-свидетельство с кнопкой скачивания', () => {
    writeProjectFrameworkSectionSnapshot(PROJECT_ID, 'experiments', {
      projectId: PROJECT_ID,
      sectionId: 'experiments',
      title: 'Проверки',
      updatedAt: '',
      items: [],
      completedChecks: 0,
      totalChecks: 0,
      form: [
        {
          id: 1,
          values: {
            [NAME_KEY]: 'Аудит склада',
            evidence: serializeEvidence([
              createEvidence({ id: 'f1', kind: 'file', title: 'audit.pdf', stance: 'за', storagePath: 'project-7/checks/1/abc__audit.pdf', size: 2048 }),
            ]),
          },
        },
      ],
    });

    const html = render();
    expect(html).toContain('audit.pdf');
    expect(html).toContain('Скачать');
  });
});
