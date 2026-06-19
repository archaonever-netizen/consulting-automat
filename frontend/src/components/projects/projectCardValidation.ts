// Сериализация содержимого карточки фреймворка проекта в читаемый текст для
// AI-валидатора. Переиспользует существующие ридеры снапшотов (те же, что и
// ProjectWholeProjectCanvas). Чистая функция — её удобно покрыть тестом.
import { readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { readProjectTheorySnapshot } from './projectTheorySnapshot';

type Item = { label?: string; summary?: string; status?: string };

// Секции, которые хранятся как generic framework-section snapshot (включая OKR).
const SECTION_TITLES: Record<string, string> = {
  'strategy-map': 'Стратегическая карта',
  hypotheses: 'Гипотезы',
  experiments: 'Проверки',
  decisions: 'Решения',
  'okr-kpi': 'OKR / KPI',
  initiatives: 'Инициативы',
  'business-processes': 'Бизнес-процессы',
  tasks: 'Задачи',
  'facts-learning': 'Факты и обучение',
};

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// «Метка: значение» — только если значение непустое.
function field(label: string, value: unknown): string {
  const text = clean(value);
  return text ? `${label}: ${text}` : '';
}

// Список повторяемых сущностей (label + summary), отбрасывая пустые.
function items(title: string, list: Item[] | undefined): string {
  const rows = (list ?? [])
    .map(item => {
      const label = clean(item.label);
      const summary = clean(item.summary);
      const status = clean(item.status);
      const body = [summary, status && status !== 'не заполнено' ? `[${status}]` : '']
        .filter(Boolean)
        .join(' ');
      const line = [label, body].filter(Boolean).join(' — ');
      return line ? `  • ${line}` : '';
    })
    .filter(Boolean);
  return rows.length ? `${title}:\n${rows.join('\n')}` : '';
}

// Собрать блоки в текст, отбросив пустые строки/секции.
function compose(parts: Array<string | undefined>): string {
  return parts.map(p => (p ?? '').trim()).filter(Boolean).join('\n');
}

function buildTheory(projectId: number): string {
  const snap = readProjectTheorySnapshot(projectId);
  if (!snap) return '';
  return compose(
    snap.blocks.map(block =>
      compose([
        clean(block.title) ? `### ${block.title}` : '',
        field('Ожидаемое состояние', block.expectedState),
        field('Что даёт диагнозу', block.output),
        items('Элементы', block.items),
      ]),
    ),
  );
}

function buildDiagnosis(projectId: number): string {
  const s = readProjectDiagnosisSnapshot(projectId);
  if (!s) return '';
  return compose([
    field('Сырой запрос клиента', s.rawRequest),
    field('Тип запроса', s.requestType),
    field('Контекст запроса', s.requestContext),
    s.areas?.length ? `Область диагноза: ${s.areas.join(', ')}` : '',
    field('Ключевой вызов', s.keyChallenge),
    field('Тип ключевого препятствия', s.obstacleType),
    field('Ограничивающий фактор', s.limitingFactor),
    field('Масштаб', s.scale),
    field('Вывод для стратегического выбора', s.strategicConclusion),
    field('Что исключает диагноз', s.exclusions),
    field('Итоговая формулировка', s.finalStatement),
    items('Разрывы теории и реальности', s.gaps),
    items('Симптомы', s.symptoms),
    items('Факты', s.facts),
    items('Альтернативные объяснения', s.alternatives),
    items('Последствия без изменений', s.consequences),
  ]);
}

function buildStrategicChoice(projectId: number): string {
  const s = readProjectStrategicChoiceSnapshot(projectId);
  if (!s) return '';
  return compose([
    field('Стратегический вопрос', s.strategicQuestion),
    field('Winning aspiration', s.winningAspiration),
    field('Тип победы', s.winType),
    field('Where to play', s.whereToPlay),
    field('Где: клиент', s.whereClient),
    field('Где: география', s.whereGeography),
    field('Где: продукт', s.whereProduct),
    field('Где: процесс', s.whereProcess),
    field('Где: включено', s.whereIncluded),
    field('Где: исключено', s.whereExcluded),
    field('How to win', s.howToWin),
    field('Как закрывает диагноз', s.howDiagnosisFit),
    field('Ценность', s.howValue),
    field('Преимущество', s.howAdvantage),
    field('Изменение системы', s.howSystemChange),
    field('Лучше альтернатив', s.howBetterThanAlternatives),
    field('Системы управления', s.managementSystems),
    field('Принятый выбор', s.acceptedChoice),
    field('Guiding policy', s.guidingPolicy),
    items('Способности (capabilities)', s.capabilities),
    items('Trade-offs', s.tradeOffs),
    items('Действия', s.actions),
    items('Гипотезы', s.hypotheses),
  ]);
}

function buildTargetState(projectId: number): string {
  const s = readProjectTargetStateSnapshot(projectId);
  if (!s) return '';
  return compose([
    field('Формулировка целевого состояния', s.statement),
    field('Тип', s.type),
    field('Where to play', s.whereToPlay),
    field('How to win', s.howToWin),
    field('Objective', s.objective),
    field('Итоговая формулировка', s.finalStatement),
    items('Результаты', s.results),
    items('Ценность для стейкхолдеров', s.stakeholderValues),
    items('Операционные модели', s.operatingModels),
    items('Способности', s.capabilities),
    items('Системы управления', s.managementSystems),
    items('Цели по качеству', s.qualityTargets),
    items('Что сохраняем', s.preserveTargets),
    items('Ограничения', s.constraints),
    items('Key results', s.keyResults),
  ]);
}

function buildSection(projectId: number, cardId: string): string {
  const snap = readProjectFrameworkSectionSnapshot(projectId, cardId);
  if (!snap) return '';
  return items(SECTION_TITLES[cardId] || snap.title || cardId, snap.items);
}

function buildWholeProject(projectId: number): string {
  const blocks: Array<[string, string]> = [
    ['Теория проекта', buildTheory(projectId)],
    ['Диагноз', buildDiagnosis(projectId)],
    ['Стратегический выбор', buildStrategicChoice(projectId)],
    ['Целевое состояние', buildTargetState(projectId)],
    ...Object.keys(SECTION_TITLES).map(
      id => [SECTION_TITLES[id], buildSection(projectId, id)] as [string, string],
    ),
  ];
  return compose(
    blocks
      .filter(([, body]) => body.trim())
      .map(([title, body]) => `## ${title}\n${body}`),
  );
}

/**
 * Собрать читаемый текст содержимого карточки для отправки в AI-валидатор.
 * Возвращает '' если карточка пустая или снапшота ещё нет.
 */
export function buildCardValidationText(projectId: number, cardId: string): string {
  switch (cardId) {
    case 'project-theory':
      return buildTheory(projectId);
    case 'diagnosis':
      return buildDiagnosis(projectId);
    case 'strategic-choice':
      return buildStrategicChoice(projectId);
    case 'target-state':
      return buildTargetState(projectId);
    case 'whole-project':
      return buildWholeProject(projectId);
    default:
      if (cardId in SECTION_TITLES) return buildSection(projectId, cardId);
      return '';
  }
}
