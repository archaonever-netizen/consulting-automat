import { beforeEach, describe, expect, it } from 'vitest';
import { buildScaffoldedCompositionText, hasCompositionScaffold } from './projectCompositionSource';
import { getFallbackProjectDiagnosisSnapshot, writeProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';

const PROJECT_ID = 77;

describe('buildScaffoldedCompositionText', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('помечает карточки со «строительными лесами»', () => {
    expect(hasCompositionScaffold('diagnosis')).toBe(true);
    expect(hasCompositionScaffold('strategic-choice')).toBe(true);
    expect(hasCompositionScaffold('target-state')).toBe(true);
    expect(hasCompositionScaffold('strategy-map')).toBe(true);
    // Теория и обычные секции идут прежним путём — лесов у них здесь нет.
    expect(hasCompositionScaffold('project-theory')).toBe(false);
    expect(hasCompositionScaffold('hypotheses')).toBe(false);
  });

  it('на пустом разделе всё равно отдаёт леса (заголовки + пояснения), а не пусто', () => {
    const text = buildScaffoldedCompositionText(PROJECT_ID, 'strategic-choice');
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('### Стратегический вопрос и выигрыш');
    expect(text).toContain('### Способности');
    // пояснение блока присутствует даже без данных
    expect(text).toContain('Способности, без которых выбор нереализуем');
  });

  it('подставляет данные рабочей формы под нужные блоки и сохраняет пустые блоки', () => {
    const snap = getFallbackProjectDiagnosisSnapshot(PROJECT_ID);
    snap.form = {
      diagnosis: { rawRequest: 'Сделайте нам CRM', keyChallenge: 'Команда не достигает результата' },
      gaps: [],
      symptoms: [{ id: 1, description: 'Жалобы клиентов' }],
      facts: [],
      alternatives: [],
      verifications: [],
      consequences: [],
    };
    writeProjectDiagnosisSnapshot(PROJECT_ID, snap);

    const text = buildScaffoldedCompositionText(PROJECT_ID, 'diagnosis');
    // Скаляры попадают в свои блоки с подписями полей.
    expect(text).toContain('### Сырой запрос клиента');
    expect(text).toContain('Сырой запрос клиента: Сделайте нам CRM');
    expect(text).toContain('### Диагностическое суждение');
    expect(text).toContain('Ключевой вызов: Команда не достигает результата');
    // Список с данными — элемент виден.
    expect(text).toContain('### Симптомы');
    expect(text).toContain('- Жалобы клиентов');
    // Пустой список всё равно присутствует как блок (леса), но без элементов.
    expect(text).toContain('### Факты');
    expect(text).toContain('Факты дают проверяемые');
  });

  it('возвращает пустую строку для карточки без лесов', () => {
    expect(buildScaffoldedCompositionText(PROJECT_ID, 'project-theory')).toBe('');
    expect(buildScaffoldedCompositionText(PROJECT_ID, 'not-a-card')).toBe('');
  });
});
