import { pushCardSnapshot } from './projectCardServerSync';

export type ProjectTheoryBlockId =
  | 'mission'
  | 'stakeholder'
  | 'results'
  | 'competencies'
  | 'constraints'
  | 'quality'
  | 'preserve';

export type ProjectTheorySnapshotItem = {
  id: string;
  label: string;
  summary: string;
};

export type ProjectTheoryBlockSnapshot = {
  id: ProjectTheoryBlockId;
  title: string;
  diagnosisQuestion: string;
  fallbackExpectedState: string;
  expectedState: string;
  output: string;
  items: ProjectTheorySnapshotItem[];
};

export type ProjectTheorySnapshot = {
  projectId: number;
  updatedAt: string;
  blocks: ProjectTheoryBlockSnapshot[];
  // Полное состояние редактора (lossless) для восстановления ввода при возврате на экран.
  // blocks выше — производная выжимка для нижележащих экранов.
  form?: unknown;
};

export const PROJECT_THEORY_BLOCKS: Array<Omit<ProjectTheoryBlockSnapshot, 'expectedState' | 'items'>> = [
  {
    id: 'mission',
    title: 'Миссия проекта',
    diagnosisQuestion: 'Что в текущей реальности мешает миссии быть выполненной?',
    fallbackExpectedState: 'Проект создает понятную ценность для выбранного выгодоприобретателя.',
    output: 'разрыв между заявленным смыслом проекта и фактической ситуацией',
  },
  {
    id: 'stakeholder',
    title: 'Клиент / выгодоприобретатель',
    diagnosisQuestion: 'Кто реально испытывает проблему или получает ущерб?',
    fallbackExpectedState: 'Роли заказчика, пользователя результата и выгодоприобретателя разделены.',
    output: 'подтвержденный или уточненный выгодоприобретатель проблемы',
  },
  {
    id: 'results',
    title: 'Критерии результата',
    diagnosisQuestion: 'Какие заявленные результаты сейчас не достигаются и почему?',
    fallbackExpectedState: 'Результат измерим, ограничен сроком и имеет источник проверки.',
    output: 'разрыв между текущим и целевым состоянием',
  },
  {
    id: 'competencies',
    title: 'Ключевые компетенции',
    diagnosisQuestion: 'Каких способностей не хватает для достижения результата?',
    fallbackExpectedState: 'Ключевые компетенции связаны с результатами и имеют носителей.',
    output: 'компетентностное узкое место',
  },
  {
    id: 'constraints',
    title: 'Ограничения',
    diagnosisQuestion: 'Какое ограничение сильнее всего блокирует результат?',
    fallbackExpectedState: 'Ограничения включают сроки, бюджет, ресурсы, качество и запреты.',
    output: 'главный ограничивающий фактор',
  },
  {
    id: 'quality',
    title: 'Качество',
    diagnosisQuestion: 'Есть ли дефекты, жалобы, переделки, нарушения SLA или приемки?',
    fallbackExpectedState: 'Качество измеряется через дефекты, источник контроля и минимальный уровень.',
    output: 'качество как симптом или препятствие',
  },
  {
    id: 'preserve',
    title: 'Что нельзя разрушить',
    diagnosisQuestion: 'Не вызвана ли проблема улучшением одной части системы за счет разрушения другой?',
    fallbackExpectedState: 'Сохраняемое ядро имеет наблюдаемые индикаторы и запреты.',
    output: 'риск повреждения сохраняемого ядра',
  },
];

export function getFallbackProjectTheorySnapshot(projectId: number): ProjectTheorySnapshot {
  return {
    projectId,
    updatedAt: '',
    blocks: PROJECT_THEORY_BLOCKS.map(block => ({
      ...block,
      expectedState: block.fallbackExpectedState,
      items: [],
    })),
  };
}

export function getProjectTheorySnapshotKey(projectId: number) {
  return `project_theory_snapshot:${projectId}`;
}

export function readProjectTheorySnapshot(projectId: number): ProjectTheorySnapshot | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getProjectTheorySnapshotKey(projectId));
    if (!raw) return null;
    return JSON.parse(raw) as ProjectTheorySnapshot;
  } catch {
    return null;
  }
}

export function writeProjectTheorySnapshot(projectId: number, snapshot: ProjectTheorySnapshot) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getProjectTheorySnapshotKey(projectId), JSON.stringify(snapshot));
  pushCardSnapshot(projectId, 'project-theory', snapshot);
}
