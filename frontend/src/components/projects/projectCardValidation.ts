// Сериализация содержимого карточки фреймворка проекта в читаемый текст для
// AI-валидатора. Переиспользует существующие ридеры снапшотов (те же, что и
// ProjectWholeProjectCanvas). Чистая функция — её удобно покрыть тестом.
import { readProjectDiagnosisSnapshot } from './projectDiagnosisSnapshot';
import { readProjectFrameworkSectionSnapshot } from './projectFrameworkSectionSnapshot';
import { readProjectStrategicChoiceSnapshot } from './projectStrategicChoiceSnapshot';
import { readProjectTargetStateSnapshot } from './projectTargetStateSnapshot';
import { PROJECT_THEORY_BLOCKS, readProjectTheorySnapshot } from './projectTheorySnapshot';

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

// Заголовок разрыва как в редакторе Диагноза: «N. <блок Теории>».
const THEORY_BLOCK_TITLE = new Map<string, string>(PROJECT_THEORY_BLOCKS.map(b => [b.id, b.title]));
type FormRow = Record<string, unknown>;

// Аудит связей Диагноза. Поля-ссылки (relatedGap/confirmingFact/confirms/refutes) задаются
// выпадашками и НЕ попадают в обычную выжимку (summary), поэтому Методолог их «не видит».
// Здесь мы делаем их видимыми и явно отмечаем незаполненные (⚠) + формулируем правило, чтобы
// Методолог понижал RAG и предлагал заполнить недостающие связи.
function buildDiagnosisLinks(form: Record<string, unknown>): string {
  const arr = (k: string): FormRow[] => (Array.isArray(form[k]) ? (form[k] as FormRow[]) : []);
  let missing = 0;
  const warn = () => { missing += 1; return '⚠ '; };
  const gapTitle = (g: FormRow, i: number) =>
    `${i + 1}. ${THEORY_BLOCK_TITLE.get(clean(g.theoryBlock)) || clean(g.theoryBlock) || 'разрыв'}`;

  // Симптом → разрыв (поле relatedGap). Считаем только реальные симптомы (с описанием).
  const symptomRows = arr('symptoms')
    .filter(s => clean(s.description))
    .map(s => {
      const link = clean(s.relatedGap);
      return `  • «${clean(s.description)}»: ${link ? `связан с разрывом «${link}»` : `${warn()}разрыв не выбран`}`;
    });

  // Разрыв → подтверждающий факт (поле confirmingFact). Считаем разрывы с пользовательским контентом.
  const gapRows = arr('gaps')
    .map((g, i) => ({ g, i }))
    .filter(({ g }) => clean(g.observedReality) || clean(g.gap))
    .map(({ g, i }) => {
      const link = clean(g.confirmingFact);
      return `  • «${gapTitle(g, i)}»: ${link ? `подтверждается фактом «${link}»` : `${warn()}подтверждающий факт не выбран`}`;
    });

  // Альтернативное объяснение → факт (confirms/refutes).
  const altRows = arr('alternatives')
    .filter(a => clean(a.reason))
    .map(a => {
      const conf = clean(a.confirms), ref = clean(a.refutes);
      const parts = [conf && `подтверждается фактом «${conf}»`, ref && `опровергается фактом «${ref}»`].filter(Boolean);
      return `  • «${clean(a.reason)}»: ${parts.length ? parts.join('; ') : `${warn()}нет подтверждающего/опровергающего факта`}`;
    });

  const sections = compose([
    symptomRows.length ? `Симптом → разрыв:\n${symptomRows.join('\n')}` : '',
    gapRows.length ? `Разрыв → подтверждающий факт:\n${gapRows.join('\n')}` : '',
    altRows.length ? `Альтернативное объяснение → факт:\n${altRows.join('\n')}` : '',
  ]);
  if (!sections) return '';

  return compose([
    'Проверка связей Диагностики (методологическое требование):',
    'Правило: каждый симптом должен быть связан с разрывом; каждый разрыв — подтверждён фактом; '
      + 'у каждого альтернативного объяснения должен быть подтверждающий или опровергающий факт. '
      + 'Отметка ⚠ означает, что связь не настроена (выпадающий список пуст) — это методологический пробел. '
      + 'Если есть хотя бы одна ⚠, не ставь раздел в GREEN: при единичных пробелах — AMBER, при системных — RED; '
      + 'перечисли незаполненные связи в «missing» и предложи их заполнить.',
    sections,
    `Незаполненных связей: ${missing}.`,
  ]);
}

function buildDiagnosis(projectId: number): string {
  const s = readProjectDiagnosisSnapshot(projectId);
  if (!s) return '';
  const form = s.form && typeof s.form === 'object' ? (s.form as Record<string, unknown>) : null;
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
    items('Проверка диагноза', s.verifications),
    form ? buildDiagnosisLinks(form) : '',
  ]);
}

function buildStrategicChoice(projectId: number): string {
  const s = readProjectStrategicChoiceSnapshot(projectId);
  if (!s) return '';
  return compose([
    field('Стратегический вопрос', s.strategicQuestion),
    field('Что считаем победой', s.winningAspiration),
    field('Тип победы', s.winType),
    field('Где конкурируем', s.whereToPlay),
    field('Где: клиент', s.whereClient),
    field('Где: география', s.whereGeography),
    field('Где: продукт', s.whereProduct),
    field('Где: процесс', s.whereProcess),
    field('Где: включено', s.whereIncluded),
    field('Где: исключено', s.whereExcluded),
    field('Как выигрываем', s.howToWin),
    field('Как закрывает диагноз', s.howDiagnosisFit),
    field('Ценность', s.howValue),
    field('Преимущество', s.howAdvantage),
    field('Изменение системы', s.howSystemChange),
    field('Лучше альтернатив', s.howBetterThanAlternatives),
    field('Системы управления', s.managementSystems),
    field('Принятый выбор', s.acceptedChoice),
    field('Направляющая политика', s.guidingPolicy),
    field('Что будет, если ничего не делать', s.noActionConsequence),
    items('Способности', s.capabilities),
    items('Стратегические альтернативы', s.alternatives),
    items('Компромиссы', s.tradeOffs),
    items('Действия', s.actions),
    items('Гипотезы', s.hypotheses),
  ]);
}

function buildTargetState(projectId: number): string {
  const s = readProjectTargetStateSnapshot(projectId);
  if (!s) return '';
  // Таблица «что изменится / что сохранится» лежит только в lossless-form (без top-level проекции);
  // показываем валидатору лишь заполненные строки, чтобы пустая таблица не выглядела заполненной.
  const form = (s.form && typeof s.form === 'object' ? s.form : {}) as {
    comparisonRows?: Array<{ area?: string; change?: string; preserve?: string }>;
  };
  const comparison = items(
    'Что изменится / что сохранится',
    (form.comparisonRows ?? [])
      .filter(row => clean(row.change) || clean(row.preserve))
      .map(row => ({
        label: clean(row.area),
        summary: [field('изменится', row.change), field('сохранится', row.preserve)].filter(Boolean).join('; '),
      })),
  );
  return compose([
    field('Формулировка целевого состояния', s.statement),
    field('Тип', s.type),
    field('Где конкурируем', s.whereToPlay),
    field('Как выигрываем', s.howToWin),
    field('Цель (Objective)', s.objective),
    field('Итоговая формулировка', s.finalStatement),
    items('Результаты', s.results),
    items('Ценность для стейкхолдеров', s.stakeholderValues),
    items('Операционные модели', s.operatingModels),
    items('Способности', s.capabilities),
    items('Системы управления', s.managementSystems),
    items('Цели по качеству', s.qualityTargets),
    items('Что сохраняем', s.preserveTargets),
    comparison,
    items('Ограничения', s.constraints),
    items('Ключевые результаты', s.keyResults),
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
    ['Диагностика', buildDiagnosis(projectId)],
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
