import { beforeEach, describe, expect, it } from 'vitest';
import { buildCardValidationText } from './projectCardValidation';
import { writeProjectDiagnosisSnapshot, getFallbackProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { writeProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';

const PROJECT_ID = 42;

describe('buildCardValidationText', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns empty string when no snapshot exists', () => {
    expect(buildCardValidationText(PROJECT_ID, 'diagnosis')).toBe('');
    expect(buildCardValidationText(PROJECT_ID, 'hypotheses')).toBe('');
  });

  it('returns empty string for unknown card id', () => {
    expect(buildCardValidationText(PROJECT_ID, 'not-a-card')).toBe('');
  });

  it('serializes filled diagnosis fields and repeatable items', () => {
    const snap = getFallbackProjectDiagnosisSnapshot(PROJECT_ID);
    snap.rawRequest = 'Сделайте нам CRM';
    snap.keyChallenge = 'Команда не достигает результата из-за узкого места';
    snap.facts = [{ id: '1', label: 'Конверсия', summary: 'Конверсия — 2% за квартал' }];
    writeProjectDiagnosisSnapshot(PROJECT_ID, snap);

    const text = buildCardValidationText(PROJECT_ID, 'diagnosis');
    expect(text).toContain('Сырой запрос клиента: Сделайте нам CRM');
    expect(text).toContain('Ключевой вызов: Команда не достигает результата');
    expect(text).toContain('Факты:');
    expect(text).toContain('Конверсия — Конверсия — 2% за квартал');
  });

  it('serializes generic framework section cards (incl. OKR) via section snapshot', () => {
    writeProjectFrameworkSectionSnapshot(PROJECT_ID, 'okr-kpi', {
      projectId: PROJECT_ID,
      sectionId: 'okr-kpi',
      title: 'OKR / KPI',
      updatedAt: '',
      completedChecks: 1,
      totalChecks: 3,
      items: [
        { id: '1', label: 'Рост выручки', summary: 'KR1: +20% к Q3', status: 'заполнено' },
        { id: '2', label: '', summary: '', status: 'не заполнено' },
      ],
    });

    const text = buildCardValidationText(PROJECT_ID, 'okr-kpi');
    expect(text).toContain('OKR / KPI:');
    expect(text).toContain('Рост выручки — KR1: +20% к Q3 [заполнено]');
    // Пустые элементы отбрасываются.
    expect(text).not.toContain('не заполнено');
  });
});
