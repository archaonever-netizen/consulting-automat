// Источник текста для ИИ-композиции «по образцу Теории проекта»: каждый блок раздела
// ВСЕГДА выводится с заголовком и методологическим пояснением (строительные леса), даже
// когда поля пусты, а под ним — реально внесённые сотрудником данные из рабочей формы.
//
// Зачем отдельный модуль: «Теория проекта» собирается надёжно, потому что её блоки несут
// встроенные пояснения (fallbackExpectedState/output) — текст никогда не пуст. У сложных
// карточек (Диагностика/Стратегический выбор/Целевое состояние) и секции «Стратегическая
// карта» таких пояснений в данных не было. Здесь мы задаём их декларативно (CARD_SCAFFOLDS)
// и собираем источник из ЕДИНОЙ рабочей модели buildProjectEditModel (та же форма, что видна
// в левом компактном канвасе) — поэтому композиция перестаёт зависеть от хрупкой проекции.
//
// ВАЖНО (изоляция): модуль НИЧЕГО не меняет в валидаторе, компактном канвасе, чате-Методологе
// и редакторах — он только формирует строку-источник для конвейера композиции.
import { buildProjectEditModel, type EditableCard, type EditableList } from './projectEditModel';

// Блок строится из скаляров карточки (подмножество полей по ключам) ИЛИ из списка (по его id).
type ScaffoldBlock =
  | { kind: 'scalars'; title: string; description: string; fields?: string[] }
  | { kind: 'list'; list: string; title: string; description: string };

interface CardScaffold {
  blocks: ScaffoldBlock[];
}

const scalars = (title: string, description: string, fields?: string[]): ScaffoldBlock =>
  ({ kind: 'scalars', title, description, fields });
const list = (id: string, title: string, description: string): ScaffoldBlock =>
  ({ kind: 'list', list: id, title, description });

// Пояснения сформулированы по примечаниям соответствующих экранов-редакторов (DiagnosisSection/
// StrategicSection/TargetSection) и описаниям карточек — чтобы смысл совпал с тем, что задумано
// методологией, а не выдумывался моделью.
const CARD_SCAFFOLDS: Record<string, CardScaffold> = {
  diagnosis: {
    blocks: [
      scalars(
        'Сырой запрос клиента',
        'Исходный запрос клиента фиксируется дословно, без интерпретации; затем определяются его тип и контекст возникновения.',
        ['rawRequest', 'requestType', 'requestContext'],
      ),
      list(
        'gaps',
        'Разрывы теории и реальности',
        'Каждый разрыв показывает расхождение между ожидаемым состоянием из Теории проекта и фактической реальностью: ожидалось X, фактически Y, подтверждается фактом Z.',
      ),
      list(
        'symptoms',
        'Симптомы',
        'Симптомы описывают наблюдаемые проявления проблемы — где, у кого и как часто она видна.',
      ),
      list(
        'facts',
        'Факты',
        'Факты дают проверяемые, измеримые основания диагноза с указанием источника данных.',
      ),
      scalars(
        'Диагностическое суждение',
        'Формулируются главный вызов, тип ключевого препятствия, ограничивающий фактор и масштаб диагноза.',
        ['keyChallenge', 'obstacleType', 'limitingFactor', 'scale'],
      ),
      list(
        'alternatives',
        'Альтернативные объяснения',
        'Диагноз должен выдерживать конкурирующие объяснения: каждое подтверждается или опровергается фактом.',
      ),
      list(
        'verifications',
        'Проверки диагноза',
        'План проверки: как именно подтвердить или опровергнуть диагноз, кто это делает и в какой срок.',
      ),
      list(
        'consequences',
        'Последствия без изменений',
        'Что ухудшится, кого затронет и какой ущерб возникнет, если ничего не менять.',
      ),
      scalars(
        'Вывод и итоговая формулировка',
        'Диагностика готовит следующий экран — Стратегический выбор: фиксируются вывод для него, что диагноз исключает, и итоговая формулировка.',
        ['strategicConclusion', 'exclusions', 'finalStatement'],
      ),
    ],
  },

  'strategic-choice': {
    blocks: [
      scalars(
        'Стратегический вопрос и выигрыш',
        'Формулируем, какой подход выбираем, чтобы преодолеть препятствие из Диагностики и достичь результата из Теории проекта, и что считаем победой.',
        ['strategicQuestion', 'winningAspiration', 'winType'],
      ),
      scalars(
        'Где конкурируем',
        'Явно очерчивается поле игры: клиент, география, продукт и процесс — что включено и что исключено.',
        ['whereClient', 'whereGeography', 'whereProduct', 'whereProcess', 'whereIncluded', 'whereExcluded'],
      ),
      scalars(
        'Как выигрываем',
        'Как именно побеждаем на выбранном поле и почему этот способ закрывает диагноз и лучше альтернатив.',
        ['howApproach', 'howDiagnosisFit', 'howValue', 'howAdvantage', 'howSystemChange', 'howBetterThanAlternatives'],
      ),
      list(
        'capabilities',
        'Способности',
        'Способности, без которых выбор нереализуем; связаны с ключевыми компетенциями Теории проекта.',
      ),
      scalars(
        'Системы управления',
        'Управленческие системы — метрики, ритм, владельцы решений, отчётность и контроль, — которые удерживают выбор в исполнении.',
        ['managementMetrics', 'managementRhythm', 'decisionOwners', 'reporting', 'controlProcess', 'dataSystem', 'resourceAllocation', 'reviewMechanism'],
      ),
      list(
        'alternatives',
        'Стратегические альтернативы',
        'Выбранный подход сравнивается с альтернативами, включая обязательную альтернативу «ничего не делать».',
      ),
      scalars(
        'Если ничего не делать',
        'Цена бездействия: что произойдёт, какой результат не будет достигнут, кого затронет и общий вывод.',
        ['noActionWhatHappens', 'noActionMissedResult', 'noActionAffected', 'noActionVerdict'],
      ),
      scalars(
        'Принятый выбор и направляющая политика',
        'Зафиксированная стратегическая позиция и направляющая политика, задающая логику дальнейших действий.',
        ['selectedAlternative', 'acceptedChoice', 'guidingPolicy'],
      ),
      list(
        'tradeOffs',
        'Компромиссы',
        'Осознанные отказы — что мы намеренно не делаем ради выбранной позиции.',
      ),
      list(
        'actions',
        'Действия',
        'Согласованные действия, реализующие выбранную стратегическую альтернативу.',
      ),
      list(
        'hypotheses',
        'Гипотезы',
        'Непроверенные предположения выбора, которые передаются на экран «Гипотезы» для проверки.',
      ),
    ],
  },

  'target-state': {
    blocks: [
      scalars(
        'Формулировка целевого состояния',
        'Общая будущая правда о системе после успешного завершения проекта и её тип.',
        ['statement', 'type'],
      ),
      scalars(
        'Где конкурируем',
        'Поле игры целевой системы: клиент/сегмент, география, продукт, процесс и что исключаем.',
        ['whereClient', 'whereGeography', 'whereProduct', 'whereProcess', 'whereExcluded'],
      ),
      scalars(
        'Как выигрываем',
        'Выбранный способ победы: ценность для клиента, источник преимущества, снимаемое препятствие и чем лучше альтернатив.',
        ['howApproach', 'howValue', 'howAdvantage', 'howObstacle', 'howBetter'],
      ),
      list(
        'results',
        'Результаты',
        'Целевые результаты с измеримыми критериями; связаны с критериями результата Теории проекта.',
      ),
      list(
        'stakeholderValues',
        'Ценность для стейкхолдеров',
        'Какую ценность целевая система создаёт для каждого стейкхолдера и как она измеряется.',
      ),
      list(
        'operatingModels',
        'Операционные модели',
        'Будущие процессы и системы, которые стабильно воспроизводят результат, через измеримые параметры.',
      ),
      list(
        'capabilities',
        'Способности',
        'Способности целевой модели; опираются на компетенции Теории и способности Стратегического выбора.',
      ),
      list(
        'managementSystems',
        'Системы управления',
        'Управленческие системы, удерживающие целевое состояние; связаны с элементами Стратегического выбора.',
      ),
      list(
        'qualityTargets',
        'Цели по качеству',
        'Целевые показатели качества с источником контроля; связаны с показателями качества Теории проекта.',
      ),
      list(
        'preserveTargets',
        'Что сохраняем',
        'Сохраняемое ядро — что нельзя разрушить при переходе к целевому состоянию.',
      ),
      list(
        'comparisonRows',
        'Что изменится / что сохранится',
        'По каждой области целевая модель явно различает изменяемые практики и сохраняемое ядро.',
      ),
      list(
        'constraints',
        'Ограничения',
        'Ограничения, которые целевая модель обязана соблюдать.',
      ),
      scalars(
        'Цель и итоговая формулировка',
        'Цель (Objective) задаёт направление, итоговая формулировка собирает целевое состояние воедино.',
        ['objective', 'finalStatement'],
      ),
      list(
        'keyResults',
        'Ключевые результаты',
        'Измеримые ключевые результаты, бесспорно подтверждающие достижение цели.',
      ),
    ],
  },

  // Секция (один список, id списка пустой). Скаляров нет.
  'strategy-map': {
    blocks: [
      list(
        '',
        'Стратегические цели',
        'Причинно-следственная карта связывает обучение и развитие, процессы, клиентскую ценность и итоговый результат: каждая цель указывает перспективу, причину, следствие, метрику и целевое значение.',
      ),
    ],
  },
};

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// Скаляры блока: «Метка: значение» только для непустых полей выбранного подмножества ключей.
function renderScalars(card: EditableCard, keys?: string[]): string[] {
  const all = card.fields ?? [];
  const picked = keys ? keys.map(k => all.find(f => f.key === k)).filter((f): f is NonNullable<typeof f> => !!f) : all;
  return picked.map(f => (clean(f.value) ? `${f.label}: ${clean(f.value)}` : '')).filter(Boolean);
}

// Список блока: только реально заполненные элементы (как в компактном канвасе — пустые
// строки-заготовки отбрасываются). Для каждого: «- Название» + вложенные «Метка: значение».
function renderList(list: EditableList | undefined): string[] {
  if (!list) return [];
  const labelOf = new Map((list.item_fields ?? []).map(f => [f.key, f.label] as const));
  const lines: string[] = [];
  for (const item of list.items) {
    const values = Object.entries(item.values)
      .map(([k, v]) => [k, clean(v)] as const)
      .filter(([, v]) => v.length > 0);
    if (!values.length) continue; // пустая заготовка — пропускаем
    const label = clean(item.label);
    lines.push(`- ${label || '(без названия)'}`);
    for (const [k, v] of values) {
      if (v === label) continue; // не дублируем строку-название в подполях
      lines.push(`  ${labelOf.get(k) ?? k}: ${v}`);
    }
  }
  return lines;
}

/** Есть ли у карточки «строительные леса» (т.е. её композицию собираем по образцу Теории). */
export function hasCompositionScaffold(cardId: string): boolean {
  return cardId in CARD_SCAFFOLDS;
}

/**
 * Собрать источник для ИИ-композиции по образцу Теории проекта: блоки с заголовком и
 * методологическим пояснением (всегда), плюс реально внесённые данные рабочей формы под ними.
 * Возвращает '' если у карточки нет лесов (тогда вызывающий код идёт прежним путём).
 */
export function buildScaffoldedCompositionText(projectId: number, cardId: string): string {
  const scaffold = CARD_SCAFFOLDS[cardId];
  if (!scaffold) return '';
  const card = buildProjectEditModel(projectId).editable_cards.find(c => c.card_id === cardId);
  if (!card) return '';

  const out: string[] = [];
  for (const block of scaffold.blocks) {
    const data = block.kind === 'scalars'
      ? renderScalars(card, block.fields)
      : renderList(card.lists.find(l => l.list === block.list));
    out.push(`### ${block.title}`);
    if (block.description) out.push(block.description);
    out.push(...data);
  }
  return out.join('\n').trim();
}
